// @preserve author Alexander Stetsyuk
// @preserve author Glenn Rempe <glenn@rempe.us>
// @license MIT

/*jslint passfail: false, bitwise: true, nomen: true, plusplus: true, todo: false, maxerr: 1000 */
/*global define, require, module, exports, window, Uint32Array */

// eslint : http://eslint.org/docs/configuring/
/*eslint-env node, browser, jasmine */
/*eslint no-underscore-dangle:0 */

// UMD (Universal Module Definition)
// Uses Node, AMD or browser globals to create a module. This module creates
// a global even when AMD is used. This is useful if you have some scripts
// that are loaded by an AMD loader, but they still want access to globals.
// See : https://github.com/umdjs/umd
// See : https://github.com/umdjs/umd/blob/master/returnExportsGlobal.js
//
(function (root, factory) {
    "use strict";

    if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define([], function () {
            /*eslint-disable no-return-assign */
            return (root.secrets = factory());
            /*eslint-enable no-return-assign */
        });
    } else {
        // Browser globals (root is window)
        root.secrets = factory(root.crypto);
    }
}(this, function (crypto) {
    "use strict";

    var constants;

    function reset() {
        constants = {};
    }

    // Polynomial evaluation at `x` using Horner's Method
    // NOTE: fx=fx * x + coeff[i] ->  exp(log(fx) + log(x)) + coeff[i],
    //       so if fx===0, just set fx to coeff[i] because
    //       using the exp/log form will result in incorrect value
    function horner(x, coeffs) {
        var logx = constants.logs[x],
            fx = 0,
            i;

        for (i = coeffs.length - 1; i >= 0; i--) {
            if (fx !== 0) {
                fx = constants.exps[(logx + constants.logs[fx]) % constants.maxShares] ^ coeffs[i];
            } else {
                fx = coeffs[i];
            }
        }

        return fx;
    }

    // Evaluate the Lagrange interpolation polynomial at x = `at`
    // using x and y Arrays that are of the same length, with
    // corresponding elements constituting points on the polynomial.
    function lagrange(at, x, y) {
        var sum = 0,
            len,
            product,
            i,
            j;

        for (i = 0, len = x.length; i < len; i++) {
            if (y[i]) {

                product = constants.logs[y[i]];

                for (j = 0; j < len; j++) {
                    if (i !== j) {
                        if (at === x[j]) { // happens when computing a share that is in the list of shares used to compute it
                            product = -1; // fix for a zero product term, after which the sum should be sum^0 = sum, not sum^1
                            break;
                        }
                        product = (product + constants.logs[at ^ x[j]] - constants.logs[x[i] ^ x[j]] + constants.maxShares) % constants.maxShares; // to make sure it's not negative
                    }
                }

                // though exps[-1] === undefined and undefined ^ anything = anything in
                // chrome, this behavior may not hold everywhere, so do the check
                sum = product === -1 ? sum : sum ^ constants.exps[product];
            }

        }

        return sum;
    }

    // Get a random *non-zero* byte using the web crypto API.
    function getRandomNonZeroByte() {
        var singleByteArray = new Uint8Array(1);

        // Loop until we get a random non-zero byte.
        do {
            crypto.getRandomValues(singleByteArray);
        } while (singleByteArray[0] === 0);
        
        return singleByteArray[0];
    }

    // Convert a hex string to a Uint8Array.
    function hexToUint8Array(hex) {
        var parts = [];
        var i = 0;

        for (i = 0; i < hex.length; i += 2) {
            parts.push(parseInt(hex.slice(i, i+2), 16))
        }

        return new Uint8Array(parts);
    }    
    
    // This is the basic polynomial generation and evaluation function
    // for an 8-bit secret.
    // Note: no error-checking at this stage! If `secret` is NOT
    // an NUMBER in the range [0,255], the output will be incorrect!
    function getShares(secret, numShares, threshold) {
        var shares = [],
            coeffs = [secret],
            i,
            len;

        for (i = 1; i < threshold; i++) {
            coeffs[i] = getRandomNonZeroByte();
        }

        for (i = 1, len = numShares + 1; i < len; i++) {
            shares[i - 1] = {
                x: i,
                y: horner(i, coeffs)
            };
        }

        return shares;
    }

    // EXPORTED FUNCTIONS
    // //////////////////

    var secrets = {

        init: function () {
            var logs = [],
                exps = [];

            // reset all constants back to initial state
            reset();

            var fieldSize = 256;  // 2^8, because we are dealing with 8-bit secrets
            constants.maxShares = fieldSize - 1;

            // Construct the exp and log tables for multiplication.
            // This primitive polynomial is compatible with QR Code/gfshare
            // The Polynomial used is: x^8 + x^4 + x^3 + x^2 + 1
            var primitive = 0x11d;  

            var x = 1;
            for (var i = 0; i < fieldSize; i++) {
                exps[i] = x;
                logs[x] = i;
                x = x << 1;              // Left shift assignment
                if (x >= fieldSize) {
                    x = x ^ primitive;   // Bitwise XOR assignment
                    x = x & constants.maxShares;  // Bitwise AND assignment
                }
            }

            constants.logs = logs;
            constants.exps = exps;

            if (!constants.maxShares || !constants.logs || !constants.exps || constants.logs.length !== fieldSize || constants.exps.length !== fieldSize) {
                throw new Error("Initialization failed.");
            }

        },

        // Evaluates the Lagrange interpolation polynomial at x=`at` for
        // each byte of each share in the  `shares` array.
        // The output is a Uint8Array containing the secret bytes.
        combine: function (shares, at) {
            var x = [],
                y = [];

            at = at || 0;

            for (var i = 0, len = shares.length; i < len; i++) {
                var share = this.extractShareComponents(shares[i]);

                // Proceed if this share.id is not already in the Array 'x' and
                // then split each share's hex data into an Array of Integers,
                // then 'rotate' those arrays where the first element of each row is converted to
                // its own array, the second element of each to its own Array, and so on for all of the rest.
                // Essentially zipping all of the shares together.
                //
                // e.g.
                //   [ 193, 186, 29, 150, 5, 120, 44, 46, 49, 59, 6, 1, 102, 98, 177, 196 ]
                //   [ 53, 105, 139, 49, 187, 240, 91, 92, 98, 118, 12, 2, 204, 196, 127, 149 ]
                //   [ 146, 211, 249, 167, 209, 136, 118, 114, 83, 77, 10, 3, 170, 166, 206, 81 ]
                //
                // becomes:
                //
                // [ [ 193, 53, 146 ],
                //   [ 186, 105, 211 ],
                //   [ 29, 139, 249 ],
                //   [ 150, 49, 167 ],
                //   [ 5, 187, 209 ],
                //   [ 120, 240, 136 ],
                //   [ 44, 91, 118 ],
                //   [ 46, 92, 114 ],
                //   [ 49, 98, 83 ],
                //   [ 59, 118, 77 ],
                //   [ 6, 12, 10 ],
                //   [ 1, 2, 3 ],
                //   [ 102, 204, 170 ],
                //   [ 98, 196, 166 ],
                //   [ 177, 127, 206 ],
                //   [ 196, 149, 81 ] ]
                //
                if (x.indexOf(share.id) === -1) {
                    x.push(share.id);
                    var splitShare = hexToUint8Array(share.data);
                    for (var j = 0, len2 = splitShare.length; j < len2; j++) {
                        y[j] = y[j] || [];
                        y[j][x.length - 1] = splitShare[j];
                    }
                }

            }

            // Extract the secret from the 'rotated' share data and return a
            // Uint8 array which represents the secret.
            var secretBytes = new Uint8Array(y.length);
            for (var i = 0, len = y.length; i < len; i++) {
                secretBytes[i] = lagrange(at, x, y[i]);
            }

            return secretBytes;
        },

        // Given a public share, extract the share ID (Integer), and share data (Hex)
        // and return an Object containing those components.
        extractShareComponents: function (share) {
            var id,
                obj = {},
                regexStr,
                shareComponents;

            // Extract all the parts (share ID and share data) from the public share.
            // Share ID is a two-digit Hex number.
            // Share data is a Hex string.
            regexStr = "^([a-fA-F0-9][a-fA-F0-9])([a-fA-F0-9]+)$";
            shareComponents = new RegExp(regexStr).exec(share);

            // The ID is a Hex number and needs to be converted to an Integer
            if (shareComponents) {
                id = parseInt(shareComponents[1], 16);
            }

            if (typeof id !== "number" || id % 1 !== 0 || id < 1 || id > constants.maxShares) {
                throw new Error("Invalid share : Share id must be an integer between 1 and " + constants.maxShares + ", inclusive.");
            }

            if (shareComponents && shareComponents[2]) {
                obj.id = id;
                obj.data = shareComponents[2];
                return obj;
            }

            throw new Error("The share data provided is invalid : " + share);
        },

        // Divides `secretBytes`, a Uint8Array, into `numShares` shares, each an hex string,
        // requiring a `threshold` number of shares to reconstruct the secret.
        share: function (secretBytes, numShares, threshold) {
            var x = new Array(numShares),
                y = new Array(numShares);

            if (! (secretBytes instanceof Uint8Array)) {
                throw new Error("Secret must be a Uint8Array.");
            }

            if (typeof numShares !== "number" || numShares % 1 !== 0 || numShares < 2) {
                throw new Error("Number of shares must be an integer between 2 and " + constants.maxShares + ", inclusive.");
            }

            if (numShares > constants.maxShares) {
                throw new Error("Number of shares must be an integer between 2 and " + constants.maxShares + ", inclusive.");
            }

            if (typeof threshold !== "number" || threshold % 1 !== 0 || threshold < 2) {
                throw new Error("Threshold number of shares must be an integer between 2 and " + constants.maxShares + ", inclusive.");
            }

            if (threshold > constants.maxShares) {
                throw new Error("Threshold number of shares must be an integer between 2 and " + constants.maxShares + "), inclusive.");
            }

            if (threshold > numShares) {
                throw new Error("Threshold number of shares was " + threshold + " but must be less than or equal to the " + numShares + " shares specified as the total to generate.");
            }

            for (var i = 0, len = secretBytes.length; i < len; i++) {
                var subShares = getShares(secretBytes[i], numShares, threshold);
                for (var j = 0; j < numShares; j++) {
                    x[j] = x[j] || subShares[j].x;  // All x[] values are the same, so just use the first one
                    y[j] = (y[j] || "") + subShares[j].y.toString(16).padStart(2, "0");
                }
            }

            // Construct the share strings by combining the x and y values, both as hex strings.
            for (var i = 0; i < numShares; i++) {
                x[i] = x[i].toString(16).padStart(2, "0") + y[i];
            }

            return x;
        },

        /* test-code */
        // export private functions so they can be unit tested directly.
        _reset: reset,
        _horner: horner,
        _lagrange: lagrange,
        _getShares: getShares,
        /* end-test-code */

    };

    // Always initialize secrets with default settings.
    secrets.init();

    return secrets;

}));
