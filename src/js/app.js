// Coordinates the interaction of elements on the page
(function() {

    var DOM = {};
    DOM.required = $(".required");
    DOM.total = $(".total");
    DOM.secret = $(".secret");
    DOM.distributesize = $(".distributesize");
    DOM.recreatesize = $(".recreatesize");
    DOM.error = $(".error");
    DOM.generated = $(".generated");
    DOM.parts = $(".parts");
    DOM.combined = $(".combined");
    DOM.combinedSize = $(".combined-size");
    DOM.secretSize = $(".secret-size");
    DOM.loadBinary = $(".btn-load-binary");
    DOM.saveBinary = $(".btn-save-binary");

    var secretBytes = new Uint8Array(0);
    var combinedBytes = new Uint8Array(0);

    function init() {
        // Events
        DOM.required.addEventListener("input", generateParts);
        DOM.total.addEventListener("input", generateParts);
        DOM.secret.addEventListener("input", generatePartsFromTextArea);
        DOM.parts.addEventListener("input", combineParts);
        DOM.loadBinary.addEventListener("click", loadBinary);
        DOM.saveBinary.addEventListener("click", saveBinary);
    }

    // Convert a UTF16 string to UTF8 bytes.
    function UTF16StringToUTF8Bytes(UTF16Str) {
        const encoder = new TextEncoder();
        return encoder.encode(UTF16Str);
    }

    // Convert UTF8 bytes to a UTF16 string.
    function UTF8BytesToUTF16String(UTF8Bytes) {
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(UTF8Bytes);
    }

    // Generate shares from an input in the text area
    function generatePartsFromTextArea() {
        var secret = DOM.secret.value;
        secretBytes = UTF16StringToUTF8Bytes(secret);

        generateParts();
    }

    // Generate shares from an input in a file
    function generatePartsFromBytes(bytes) {
        secretBytes = bytes;
        DOM.secret.value = UTF8BytesToUTF16String(secretBytes);

        generateParts();
    }

    // Generate shares from secret bytes loaded into secretBytes
    function generateParts() {
        // Clear old generated
        DOM.generated.innerHTML = "";
        // Update the secret size
        DOM.secretSize.textContent = "(" + secretBytes.length + " bytes)";

        // Get the input values
        var total = parseFloat(DOM.total.value);
        var required = parseFloat(DOM.required.value);

        // validate the input
        if (total < 2) {
            DOM.error.textContent = "Total must be at least 1";
            return;
        }
        else if (total > 255) {
            DOM.error.textContent = "Total must be at most 255";
            return;
        }
        else if (required < 2) {
            DOM.error.textContent = "Required must be at least 1";
            return;
        }
        else if (required > 255) {
            DOM.error.textContent = "Required must be at most 255";
            return;
        }
        else if (isNaN(total)) {
            DOM.error.textContent = "Invalid value for total";
            return;
        }
        else if (isNaN(required)) {
            DOM.error.textContent = "Invalid value for required";
            return;
        }
        else if (required > total) {
            DOM.error.textContent = "Required must be less than total";
            return;
        }
        else if (secretBytes.length == 0) {
            DOM.error.textContent = "Secret is blank";
            return;
        }
        else {
            DOM.error.textContent = "";
        }
        // Generate the parts to share
        var shares = secrets.share(secretBytes, total, required);
        // Display the parts
        for (var i=0; i<shares.length; i++) {
            var share = shares[i];
            var li = document.createElement("li");
            li.classList.add("part");
            li.textContent = share;
            DOM.generated.appendChild(li);
        }
        // Update the plain-language info
        DOM.distributesize.textContent = total;
        DOM.recreatesize.textContent = required;
    }

    function combineParts() {
        // Clear old text
        DOM.combined.textContent = "";
        // Get the parts entered by the user
        var partsStr = DOM.parts.value;
        // Validate and sanitize the input
        var parts = partsStr.trim().split(/\s+/);
        // Combine the parts
        try {
            combinedBytes = secrets.combine(parts);
            var combined = UTF8BytesToUTF16String(combinedBytes);
        }
        catch (e) {
            DOM.combined.textContent = e.message;
        }
        // Display the combined parts
        DOM.combined.textContent = combined;
        DOM.combinedSize.textContent = "(" + combinedBytes.length + " bytes)";
    }

    // Load a binary file as the secret
    function loadBinary() {
        var input = document.createElement('input');
        input.type = 'file';

        input.onchange = function(event) {
            var file = event.target.files[0];
            if (file) {
                var reader = new FileReader();
                reader.onload = function(e) {
                    var loadedBytes = new Uint8Array(e.target.result);
                    generatePartsFromBytes(loadedBytes);
                };

                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    }

    // Save the combined secret as a binary file
    function saveBinary() {
        var blob = new Blob([combinedBytes], { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);

        var a = document.createElement('a');
        a.href = url;
        a.download = "secret.dat";
        document.body.appendChild(a);  // Needed to work-around behavior in old Firefox versions
        a.click();
        document.body.removeChild(a);

        // Should revoke the object URL to free up memory, but this may cause a race condition
        //URL.revokeObjectURL(url);
    }

    init();

})();
