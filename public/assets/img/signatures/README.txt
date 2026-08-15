AUTHORISED SIGNATURE
====================

Put the authorised signature image in this folder.

This system does not draw, generate or imitate a handwritten
signature. Until a real signature image is supplied by the
signatory, the certificate prints a clean placeholder reading
[ Authorized Signature ] above the signature line.

TO ADD THE REAL SIGNATURE

1. Save it as a PNG with a transparent background.
   About 1400 x 500 pixels works well. The certificate scales
   it to 18mm tall, so anything smaller than roughly 900px
   wide will look soft in print.

2. Save the file into this folder, for example:
       authorized-signature.png

3. Open  public/assets/js/signature-config.js  and set:
       image: "assets/img/signatures/authorized-signature.png",

4. Redeploy.

Certificates already issued keep verifying exactly as before.
The signature is part of the printed document, not part of the
stored certificate record.

If the configured file is ever missing or fails to load, the
certificate falls back to the placeholder rather than printing
a broken image.

The name, credentials and role in signature-config.js are
printed exactly as supplied. They must not be embellished with
titles, offices or affiliations that have not been authorised.
