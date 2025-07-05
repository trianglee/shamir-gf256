# About

A single page tool for splitting secrets into parts or recreating secrets from
existing parts.

This scheme is 100% compatible with pygfssss (https://github.com/trianglee/pygfssss).

Very heavily based on Ian Coleman's original implementation (https://iancoleman.io/shamir/).

# Usage

## Splitting

Enter the text of your secret into the field.

Copy each individual part to a file.

Distribute the files.

## Combining

Gather enough parts to recreate the secret.

Enter the content from each part into the field.

The text of the secret will be displayed under the field.

# Developing

After making changes, compile to a single page for offline use with:

```
python compile.py
```

Pull requests are welcome.

# License

MIT, see [license](https://github.com/trianglee/shamir-gf256/blob/master/license).
