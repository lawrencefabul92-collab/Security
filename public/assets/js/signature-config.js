/* =========================================================
   AUTHORISED SIGNATORY CONFIGURATION

   This system does not draw, generate or imitate a
   handwritten signature. Until a real signature image is
   supplied by the signatory, the certificate prints a clean
   placeholder above the signature line.

   TO ADD THE REAL SIGNATURE
   1. Save the signature as a PNG with a transparent
      background. Roughly 1400 x 500 pixels works well; the
      certificate scales it to 18mm tall.
   2. Put the file in:
        public/assets/img/signatures/
   3. Set `image` below to its path, for example:
        image: "assets/img/signatures/authorized-signature.png"
   4. Redeploy. Nothing else needs to change, and certificates
      already issued keep verifying exactly as before.

   The name and credentials are printed as supplied and must
   not be embellished with titles, offices or affiliations
   that have not been authorised.
   ========================================================= */

window.STA_SIGNATURE = {
  /* null = print the placeholder. A path = print that image. */
  image: "assets/img/signatures/authorized-signature.png",

  /* Alt text used when an image is configured. */
  imageAlt: "Signature of Mr. Darryl C. Bautista",

  name: "Mr. Darryl C. Bautista",
  credentials: "CSP, CST, SO4, SM",
  role: "Authorized Signatory",

  /* Shown in place of the signature while `image` is null. */
  placeholder: "[ Authorized Signature ]"
};
