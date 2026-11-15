/* ============================================================
   RÉGLAGES — c'est la SEULE partie à modifier dans le code
   ============================================================ */
const CONFIG = {
  SHOP_NAME: "Konza",
  // Numéro WhatsApp de la boutique : format international, sans + ni espaces (ex. RDC : 243812345678)
  WHATSAPP_NUMBER: "243818655315",
  CURRENCY: "$",
  // Google Sheet des articles (1re ligne = titres de colonnes)
  PRODUCTS_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzKsDq-YlN0xqboZbJfoEdwxIFOL-uA6DTq8wuXDSEob6ZpX2TrI2_e_tJVxN_-tn4CDHlMP53m69c/pub?gid=0&single=true&output=csv",
  // Onglet "Commandes" (facultatif). Laisser vide pour cacher le suivi de commande.
  ORDERS_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzKsDq-YlN0xqboZbJfoEdwxIFOL-uA6DTq8wuXDSEob6ZpX2TrI2_e_tJVxN_-tn4CDHlMP53m69c/pub?gid=1104327732&single=true&output=csv",
  // Images de Noël et du Nouvel An dans le bloc du haut. Mettre false après les fêtes.
  SHOW_FETES: true,
  // Temps entre deux images du haut
  SLIDE_SECONDS: 6
  

};
