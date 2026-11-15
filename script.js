

/* ============================ Outils ============================ */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const money = n => (Math.round(n * 100) / 100).toLocaleString("fr-FR") + " " + CONFIG.CURRENCY;
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
/* Nettoie la colonne « image » : ImgBB donne parfois un code du type
   [url=...][img]https://i.ibb.co/xxx/photo.jpg[/img][/url] (ou sa version avec %5D %5B).
   On en extrait automatiquement le lien direct de l'image. */
function cleanImageUrl(raw){
  let s = String(raw || "").trim();
  if(!s) return "";
  try{ s = decodeURIComponent(s); }catch(e){}
  const bb = s.match(/\[img\]\s*(https?:\/\/[^\s\[\]]+)\s*\[\/img\]/i);
  if(bb) return bb[1];
  const direct = s.match(/https?:\/\/[^\s\[\]]+?\.(?:jpe?g|png|webp|gif|avif)(?![a-z0-9])/ig);
  if(direct) return direct[direct.length - 1];
  return safeUrl(s.split(/[\[\]\s]/)[0]);
}
const waLink = text => `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
const CAT_COLORS = ["#F3E9DD", "#FCE3CC", "#EBD5BE", "#FFD9B8", "#F6DFC9", "#EFD3C0"];

function showNotice(msg){ const n = $("notice"); n.textContent = msg; n.style.display = "block"; }
function hideNotice(){ $("notice").style.display = "none"; }

/* Lecteur CSV (guillemets, virgules et retours à la ligne dans les cellules) */
function parseCSV(text){
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i+1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if(c === '"') q = true;
    else if(c === ','){ row.push(cell); cell = ""; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && text[i+1] === '\n') i++;
      row.push(cell); cell = "";
      if(row.some(v => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if(row.some(v => v.trim() !== "")) rows.push(row);
  return rows;
}
function csvToObjects(text){
  const rows = parseCSV(text);
  if(!rows.length) return [];
  const head = rows[0].map(norm);
  return rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => o[h] = (r[i] ?? "").trim()); return o; });
}
const pick = (o, ...keys) => { for(const k of keys) if(o[k] !== undefined && o[k] !== "") return o[k]; return ""; };

async function fetchCSV(url){
  /* Un lien « Page Web » (pubhtml) est transformé automatiquement en lien CSV */
  if(url.includes("/d/e/")){
    url = url.replace("/pubhtml", "/pub");
    if(!/[?&]output=/.test(url)) url += (url.includes("?") ? "&" : "?") + "output=csv";
  }
  const tryUrl = async u => {
    const res = await fetch(u, {cache: "no-store"});
    if(!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if(/^\s*<(!doctype|html)/i.test(text)) throw new Error("Page de connexion reçue : le Sheet n'est pas partagé publiquement");
    return text;
  };
  return await tryUrl(url);
    
}

/* Lit les articles : 1) lien CSV publié, 2) à défaut script Google */
async function loadRows(){
  const errors = [];
  const url = (CONFIG.PRODUCTS_CSV_URL || "").trim();
  if(url && !url.includes("COLLEZ_ICI")){
    try{ return csvToObjects(await fetchCSV(url)); }
    catch(e){ console.error("Lien CSV :", e); errors.push("lien CSV : " + describeError(e)); }
  }
  
  throw new Error(errors.join("  ||  ") || "aucun lien ni identifiant de Sheet n'est renseigné");
}

/* ============================ Produits ============================ */
let PRODUCTS = [];
let CATEGORIES = [];

function mapProducts(list){
  return list.map((o, i) => {
    const nom = pick(o, "nom", "name", "article", "produit", "titre");
    return {
      id: pick(o, "id", "code", "reference") || nom || String(i + 1),
      nom,
      categorie: pick(o, "categorie", "category", "rayon", "type"),
      prix: parseFloat(String(pick(o, "prix", "price", "tarif")).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
      description: pick(o, "description", "desc", "details"),
      image: cleanImageUrl(pick(o, "image", "photo", "img", "lien image", "image url")),
      vedette: ["oui", "yes", "1", "true", "vrai"].includes(norm(pick(o, "vedette", "accueil", "populaire"))),
      disponible: !["non", "no", "0", "false", "faux"].includes(norm(pick(o, "disponible", "stock", "available", "en stock")))
    };
  }).filter(p => p.nom && p.disponible);
}

function setProducts(list){
  PRODUCTS = list;
  CATEGORIES = [...new Set(PRODUCTS.map(p => p.categorie).filter(Boolean))];
}

function describeError(e){
  const m = (e && e.message) || "erreur inconnue";
  if(e && e.name === "TypeError") return "le navigateur n'a pas pu joindre Google : vérifiez la connexion internet et que le lien est bien celui de « Publier sur le web » en CSV (" + m + ")";
  return m;
}

async function loadProducts(){
  const url = (CONFIG.PRODUCTS_CSV_URL || "").trim();
  if((!url || url.includes("COLLEZ_ICI")) && !CONFIG.SHEET_ID){
    showNotice("Le lien du Google Sheet n'est pas encore renseigné : ouvrez config.js et collez-le dans PRODUCTS_CSV_URL.");
    return;
  }

  /* 1) affichage immédiat avec la dernière version gardée sur le téléphone */
  let cachedJSON = "";
  try{
    cachedJSON = localStorage.getItem("konza_products") || "";
    if(cachedJSON) setProducts(JSON.parse(cachedJSON));
  }catch(e){}
  if(PRODUCTS.length) renderAll();

  /* 2) mise à jour depuis le Google Sheet */
  let rows;
  try{ rows = await loadRows(); }
  catch(e){
    console.error("Lecture du Sheet impossible :", e);
    if(!PRODUCTS.length) showNotice("Impossible de lire le Google Sheet. Détail : " + ((e && e.message) || "erreur") + ".");
    return;
  }
  try{
    const list = mapProducts(rows);
    const json = JSON.stringify(list);
    if(json !== cachedJSON){
      setProducts(list);
      try{ localStorage.setItem("konza_products", json); }catch(e){}
    }
    hideNotice();
    if(!list.length) showNotice("Le Sheet est lu, mais aucun article n'est disponible. Vérifiez les colonnes « Nom » et « Disponible » (Oui/Non).");
  }catch(e){
    console.error("Traitement du Sheet impossible :", e);
    showNotice("Le Sheet a été lu, mais son contenu n'a pas pu être traité (" + ((e && e.message) || "erreur") + ").");
  }
}

const imgSrc = p => p.image || "logo.jpg";
function cardHTML(p){
  return `
  <article class="card">
    <div class="ph"><img src="${esc(imgSrc(p))}" alt="${esc(p.nom)}" loading="lazy" onerror="this.onerror=null;this.src='logo.jpg'"></div>
    <div class="body">
      ${p.categorie ? `<span class="cat">${esc(p.categorie)}</span>` : ""}
      <h3>${esc(p.nom)}</h3>
      <p class="desc">${esc(p.description)}</p>
      <span class="price">${money(p.prix)}</span>
      <button class="add btn" data-add="${esc(p.id)}">Ajouter</button>
    </div>
  </article>`;
}
const plural = n => n + (n > 1 ? " articles" : " article");

/* Articles mis en avant sur l'accueil : colonne « vedette » = oui, sinon 1 article par catégorie */
function featuredList(){
  const flagged = PRODUCTS.filter(p => p.vedette);
  if(flagged.length) return flagged.slice(0, 8);
  const out = [];
  CATEGORIES.forEach(c => { const p = PRODUCTS.find(x => x.categorie === c); if(p) out.push(p); });
  PRODUCTS.forEach(p => { if(out.length < 4 && !out.includes(p)) out.push(p); });
  return out.slice(0, 8);
}

function renderHome(){
  const f = featuredList();
  $("featured").innerHTML = f.length ? f.map(cardHTML).join("") : '<div class="empty" style="grid-column:1/-1">Les articles arrivent bientôt.</div>';
  $("cats").innerHTML = CATEGORIES.map((c, i) => {
    const n = PRODUCTS.filter(p => p.categorie === c).length;
    return `<a class="cat-tile btn" href="#/categorie/${encodeURIComponent(c)}" style="background:${CAT_COLORS[i % CAT_COLORS.length]}"><b>${esc(c)}</b><span>${plural(n)}</span></a>`;
  }).join("");
  $("categories").style.display = CATEGORIES.length ? "" : "none";
}

function renderList(cat){
  const list = cat === "Tout" ? PRODUCTS : PRODUCTS.filter(p => p.categorie === cat);
  $("listTitle").textContent = cat === "Tout" ? "Tous les articles" : cat;
  $("listCount").textContent = plural(list.length);
  const tabs = ["Tout", ...CATEGORIES];
  $("tabs").innerHTML = tabs.map(c => {
    const href = c === "Tout" ? "#/articles" : "#/categorie/" + encodeURIComponent(c);
    return `<a class="tab${c === cat ? " active" : ""}" href="${href}"${c === cat ? ' aria-current="page"' : ""}>${esc(c)}</a>`;
  }).join("");
  $("listCards").innerHTML = list.length ? list.map(cardHTML).join("") : '<div class="empty" style="grid-column:1/-1">Aucun article dans cette catégorie pour le moment.</div>';
}

/* ============================ Navigation (#/ , #/articles , #/categorie/Nom) ============================ */
function route(keepScroll){
  const h = location.hash.replace(/^#\/?/, "");
  let cat = null, scrollTo = null;
  if(h === "articles") cat = "Tout";
  else if(h.startsWith("categorie/")){ try{ cat = decodeURIComponent(h.slice(10)); }catch(e){ cat = "Tout"; } }
  else if(h === "categories") scrollTo = "categories";

  const isList = cat !== null;
  $("viewHome").style.display = isList ? "none" : "";
  $("viewList").style.display = isList ? "" : "none";
  if(isList){
    renderList(cat);
    document.title = (cat === "Tout" ? "Tous les articles" : cat) + " – " + CONFIG.SHOP_NAME;
    if(!keepScroll) window.scrollTo(0, 0);
  } else {
    renderHome();
    document.title = CONFIG.SHOP_NAME;
    if(!keepScroll){ if(scrollTo) $(scrollTo).scrollIntoView(); else window.scrollTo(0, 0); }
  }
}
function renderAll(){ route(true); }

/* ============================ Bloc d'accueil (images qui défilent) ============================ */
let slides = [], current = 0, timer = null;
function showSlide(i){
  current = (i + slides.length) % slides.length;
  slides.forEach((s, k) => { s.classList.toggle("on", k === current); s.setAttribute("aria-hidden", k === current ? "false" : "true"); });
  [...$("dots").children].forEach((d, k) => d.classList.toggle("on", k === current));
}
function restartTimer(){
  clearInterval(timer);
  if(slides.length < 2) return;
  timer = setInterval(() => showSlide(current + 1), CONFIG.SLIDE_SECONDS * 1000);
}
function initHero(){
  if(!CONFIG.SHOW_FETES) document.querySelectorAll("[data-fete]").forEach(s => s.remove());
  slides = [...document.querySelectorAll(".slide")];
  const dots = $("dots");
  dots.innerHTML = slides.map((_, i) => `<button class="dot${i === 0 ? " on" : ""}" data-slide="${i}" aria-label="Image ${i + 1}"><span></span></button>`).join("");
  $("heroCtrl").style.display = slides.length > 1 ? "flex" : "none";
  $("prevSlide").onclick = () => { showSlide(current - 1); restartTimer(); };
  $("nextSlide").onclick = () => { showSlide(current + 1); restartTimer(); };
  dots.addEventListener("click", e => {
    const b = e.target.closest("[data-slide]");
    if(b){ showSlide(+b.dataset.slide); restartTimer(); }
  });
  showSlide(0);
  restartTimer();
}

/* ============================ Panier ============================ */
let CART = [];
try{ CART = JSON.parse(localStorage.getItem("konza_cart") || "[]"); }catch(e){ CART = []; }
const saveCart = () => { try{ localStorage.setItem("konza_cart", JSON.stringify(CART)); }catch(e){} };

function addToCart(id){
  const p = PRODUCTS.find(x => x.id === id); if(!p) return;
  const line = CART.find(x => x.id === id);
  if(line) line.qty++; else CART.push({id: p.id, nom: p.nom, prix: p.prix, image: p.image, qty: 1});
  saveCart(); renderCart();
  const b = $("openCart"); b.style.transform = "scale(1.08)"; setTimeout(() => b.style.transform = "", 150);
}
function changeQty(id, d){
  const line = CART.find(x => x.id === id); if(!line) return;
  line.qty += d;
  if(line.qty <= 0) CART = CART.filter(x => x.id !== id);
  saveCart(); renderCart();
}
function renderCart(){
  const count = CART.reduce((s, l) => s + l.qty, 0);
  const total = CART.reduce((s, l) => s + l.qty * l.prix, 0);
  $("count").textContent = count;
  $("openCart").setAttribute("aria-label", "Ouvrir le panier, " + plural(count));
  $("total").textContent = money(total);
  $("sendWA").disabled = !CART.length;
  $("cartItems").innerHTML = CART.length ? CART.map(l => `
    <div class="item">
      <div class="thumb"><img src="${esc(l.image || "logo.jpg")}" alt="" onerror="this.onerror=null;this.src='logo.jpg'"></div>
      <div class="info"><b>${esc(l.nom)}</b><span>${money(l.prix)}</span></div>
      <div class="qty">
        <button data-minus="${esc(l.id)}" aria-label="Moins">−</button>
        <span>${l.qty}</span>
        <button data-plus="${esc(l.id)}" aria-label="Plus">+</button>
      </div>
    </div>`).join("") : '<div class="empty">Votre panier est vide.</div>';
}
function openCart(){ document.body.classList.add("cart-open"); }
function closeCart(){ document.body.classList.remove("cart-open"); }

/* ============================ WhatsApp ============================ */
function sendToWhatsApp(){
  if(!CART.length) return;
  const num = "CMD-" + Math.floor(10000 + Math.random() * 90000);
  const total = CART.reduce((s, l) => s + l.qty * l.prix, 0);
  const name = $("clientName").value.trim();
  let msg = `Bonjour ${CONFIG.SHOP_NAME}, je souhaite passer commande :\n\n`;
  CART.forEach(l => { msg += `• ${l.nom} x${l.qty} = ${money(l.qty * l.prix)}\n`; });
  msg += `\nTotal : ${money(total)}\n`;
  msg += `N° de commande : ${num}\n`;
  if(name) msg += `Nom : ${name}\n`;
  msg += "\nMerci de me confirmer la disponibilité et la livraison.";
  window.open(waLink(msg), "_blank", "noopener");
}

/* ============================ Suivi de commande ============================ */
async function checkOrder(e){
  e.preventDefault();
  const out = $("trackResult");
  const code = $("trackInput").value.trim().toUpperCase();
  if(!code){ out.textContent = ""; return; }
  out.style.color = ""; out.textContent = "Recherche…";
  try{
    const list = csvToObjects(await fetchCSV(CONFIG.ORDERS_CSV_URL));
    const found = list.find(o => String(pick(o, "numero", "commande", "id", "n")).toUpperCase() === code);
    if(found){
      const st = pick(found, "statut", "status", "etat"), dt = pick(found, "date");
      out.innerHTML = `Commande ${esc(code)} : <span style="color:var(--burnt)">${esc(st)}</span>${dt ? ` <span style="color:var(--muted);font-weight:400">(${esc(dt)})</span>` : ""}`;
    } else {
      out.style.color = "var(--danger)";
      out.textContent = "Numéro introuvable. Vérifiez-le ou contactez-nous sur WhatsApp.";
    }
  }catch(err){
    out.style.color = "var(--danger)";
    out.textContent = "Suivi indisponible pour le moment. Écrivez-nous sur WhatsApp.";
  }
}

/* ============================ Démarrage ============================ */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-add],[data-plus],[data-minus]");
  if(!t) return;
  if(t.dataset.add !== undefined) addToCart(t.dataset.add);
  if(t.dataset.plus !== undefined) changeQty(t.dataset.plus, 1);
  if(t.dataset.minus !== undefined) changeQty(t.dataset.minus, -1);
});
$("openCart").onclick = openCart;
$("closeCart").onclick = $("overlay").onclick = closeCart;
document.addEventListener("keydown", e => { if(e.key === "Escape") closeCart(); });
$("clearCart").onclick = () => { CART = []; saveCart(); renderCart(); };
$("sendWA").onclick = sendToWhatsApp;
$("trackForm").addEventListener("submit", checkOrder);
$("footerWA").href = waLink(`Bonjour ${CONFIG.SHOP_NAME}, j'ai une question.`);
if(!CONFIG.ORDERS_CSV_URL) $("suivi").style.display = "none";
window.addEventListener("hashchange", () => route());

initHero();
renderCart();
route();
loadProducts().then(() => route(true));




