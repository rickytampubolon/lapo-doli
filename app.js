const $ = id => document.getElementById(id);
const LS = { cart:"ld_cart", cust:"ld_cust", last:"ld_last", menu:"ld_menu", snap:"ld_snap" };
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const jakartaToday = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
const relDay = d => { const diff = Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(jakartaToday() + "T00:00:00Z")) / 864e5); return diff === 0 ? "Hari ini" : diff === 1 ? "Besok" : ""; };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const LOAD_MS = 8000;
/* analitik: Vercel Analytics bila aktif; tanpa itu tidak melakukan apa pun */
window.va = window.va || function(){ (window.vaq = window.vaq || []).push(arguments); };
const track = (name, data) => { try { window.va("event", data ? { name, data } : { name }); } catch (e) {} };
const SKEL = '<div class="skel" aria-hidden="true"><i></i><div><b></b><b></b><b></b></div></div>'.repeat(3);
const ic = (n, c = "") => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rp = n => "Rp " + (Number(n) || 0).toLocaleString("id-ID");
let toastT;
function toastUndo(msg, undo){
  const t = $("toast"); clearTimeout(toastT); t.textContent = msg + " ";
  const b = document.createElement("button"); b.type = "button"; b.className = "toast-undo"; b.textContent = "Urungkan";
  b.onclick = async () => { t.classList.remove("show"); try { await undo(); toast("Dibatalkan"); } catch (e) { toast("Belum berhasil mengurungkan."); } };
  t.append(b); t.classList.add("show"); toastT = setTimeout(() => t.classList.remove("show"), 7000);
}
function toast(msg){ const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

/* Tanggal PO disimpan sebagai teks YYYY-MM-DD dan ditampilkan tanpa geser zona waktu. */
const dparse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const fmtD = (s, o) => { const d = dparse(s); return d ? new Intl.DateTimeFormat("id-ID", { timeZone:"UTC", ...o }).format(d) : ""; };
const dLong = s => fmtD(s, { weekday:"long", day:"numeric", month:"long", year:"numeric" });
const dShort = s => fmtD(s, { weekday:"short", day:"numeric", month:"short" });

/* Contoh data. Dipakai kalau database belum tersedia, dan untuk "Isi menu awal". */

const DEFAULT_PRODUCTS = [
  { id:"kecap",     name:"Babi Kecap",        desc:"Babi empuk dimasak manis gurih dengan kecap dan bumbu rempah.", price:35000, emoji:"🍖", available:true, sort:1, options:["250ml=35000", "500ml=70000"], addons:[], image:"/assets/menu/babi-kecap.svg", imageUrl:"/assets/menu/babi-kecap.svg" },
  { id:"saksang",   name:"Babi Saksang",      desc:"Khas Batak, bumbu andaliman dan rempah pekat, pedas harum.",    price:40000, emoji:"🥘", available:true, sort:2, options:["Pakai gota", "Tidak pakai gota"], addons:[], image:"/assets/menu/babi-saksang.svg", imageUrl:"/assets/menu/babi-saksang.svg" },
  { id:"teri",      name:"Teri Medan Balado", desc:"Teri Medan renyah dengan sambal balado pedas.",                  price:25000, emoji:"🌶️", available:true, sort:3, options:["250ml=25000", "500ml=50000"], addons:[], image:"/assets/menu/teri-medan-balado.svg", imageUrl:"/assets/menu/teri-medan-balado.svg" },
  { id:"napinadar", name:"Ayam Napinadar",    desc:"Ayam khas Batak Toba berbumbu andaliman, pedas dan harum.",      price:40000, emoji:"🍗", available:true, sort:4, options:["250ml - Pakai gota=40000", "250ml - Tidak pakai gota=40000", "500ml - Pakai gota=75000", "500ml - Tidak pakai gota=75000"], addons:[], image:"/assets/menu/ayam-napinadar.svg", imageUrl:"/assets/menu/ayam-napinadar.svg" },
  { id:"nasi", name:"Nasi putih", desc:"Nasi putih hangat, pas untuk teman lauk.", price:5000, emoji:"🍚", available:true, sort:5, options:[], addons:[], image:"", imageUrl:"", note:false },
];
const DEFAULT_POS = [{ id:"po-20260918", date:"2026-09-18", open:true }, { id:"po-20260925", date:"2026-09-25", open:true }, { id:"po-20261001", date:"2026-10-01", open:true }];
const DEFAULT_SETTINGS = { waNumber:"6281375205386", bankName:"Seabank", bankNumber:"901912654821", bankHolder:"a.n. Ricky Halomoan", ongkir:10000, qrisPath:"", qrisUrl:"", deliveryHours:"12.00 - 14.00", pickupHours:"12.00 - 14.00", pickupLocation:"Bassura City Mall, Lobi Selatan", poCutoff:"10:00", payWindowMin:60, notifyOn:false, notifyKinds:{} };

let assetsNs = false, isAdmin = false, session = null, authReady = false, dbState = "loading"; // loading | ok | none (belum ada konfigurasi) | error
/* ================= DATA: Supabase ================= */
const CFG = window.LAPO_CONFIG || {};
const sb = (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/GANTI/.test(CFG.SUPABASE_URL + CFG.SUPABASE_ANON_KEY))
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
const assetUrl = p => !p ? "" : /^(https?:)?\/\//.test(p) || p.startsWith("/") ? p : sb.storage.from("menu").getPublicUrl(p).data.publicUrl;
/* Varian di layar ditulis "Nama" atau "Nama=harga"; di database berupa [{name, price?}]. */
const parseOptions = list => (list || []).map(s => String(s).trim()).filter(Boolean).map(s => {
  const i = s.lastIndexOf("="), digits = i > 0 ? s.slice(i + 1).replace(/\D/g, "") : "", nm = (i > 0 ? s.slice(0, i) : s).trim();
  return digits !== "" && i > 0 ? { name:nm, price:Number(digits) } : { name:nm };
}).filter(o => o.name);
const fromProduct = r => ({ id:r.id, name:r.name, desc:r.description, price:r.price, emoji:r.emoji, available:r.available, sort:r.sort, quota:r.quota == null ? null : Number(r.quota),
  options:(r.options || []).map(o => o.price != null ? `${o.name}=${o.price}` : o.name), addons:r.addons || [], image:r.image, imageUrl:assetUrl(r.image), note:r.allow_note !== false });
const toProductRow = patch => {
  const m = {};
  for (const k in patch) { const v = patch[k];
    if (k === "note") m.allow_note = v; else if (k === "desc") m.description = v; else if (k === "options") m.options = parseOptions(v);
    else if (["name", "price", "emoji", "available", "sort", "addons", "image", "quota"].includes(k)) m[k] = v; }
  return m;
};
/* tautan peta hanya boleh https ke Google (jaga-jaga terhadap data yang diubah langsung di database) */
const mapsSafe = u => /^https:\/\/(www\.google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl)([/?]|$)/.test(u || "") && String(u).length <= 300;
const fromOrder = r => ({ extraMin:Number(r.extra_min) || 0, mapsUrl:mapsSafe(r.maps_url) ? r.maps_url : "", claimedAt:r.claimed_at || null, refund:r.refund || "", id:r.id, gid:r.gid, poId:r.po_id, poDate:r.po_date, createdAt:r.created_at, source:r.source, nama:r.nama, hp:r.hp,
  area:r.area, alamat:r.alamat, fulfil:r.fulfil, pickupLoc:r.pickup_loc, notes:r.notes, method:r.method, items:Array.isArray(r.items) ? r.items : [],
  ongkir:r.ongkir, total:r.total, kode:Number(r.kode) || 0, groupTotal:r.group_total, groupCount:r.group_count, hours:r.hours, payStatus:r.pay_status, status:r.status, proofPath:r.proof_path || "" });
const must = ({ data, error }) => { if (error) throw error; return data; };
const api = {
  loadProducts: async () => must(await sb.from("products").select("*").order("sort").order("name")).map(fromProduct),
  loadPos: async () => must(await sb.from("pos").select("*").order("date")),
  loadSettings: async () => { const r = must(await sb.from("settings").select("data").eq("id", "shop").maybeSingle()); return (r && r.data) || {}; },
  loadOrders: async () => must(await sb.from("orders").select("*").order("created_at")).map(fromOrder),
  isAdmin: async () => must(await sb.rpc("is_admin")) === true,
  updateProduct: async (id, patch) => must(await sb.from("products").update(toProductRow(patch)).eq("id", id)),
  addProduct: async p => must(await sb.from("products").insert({ id:"menu-" + Math.random().toString(36).slice(2, 8), ...toProductRow(p) })),
  upsertProduct: async p => must(await sb.from("products").upsert({ id:p.id, ...toProductRow(p) })),
  removeImage: async path => { try { if (path && !/^(https?:)?\/\//.test(path) && !path.startsWith("/")) await sb.storage.from("menu").remove([path]); } catch (e) {} },
  deleteProduct: async id => must(await sb.from("products").delete().eq("id", id)),
  uploadImage: async blob => {
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg", path = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    must(await sb.storage.from("menu").upload(path, blob, { contentType:blob.type || "image/jpeg", cacheControl:"31536000" })); return path;
  },
  addPo: async (date, opensAt) => must(await sb.from("pos").insert({ id:"po-" + date.replace(/-/g, ""), date, open:true, opens_at:opensAt || null })),
  setPoOpensAt: async (id, v) => must(await sb.from("pos").update({ opens_at:v }).eq("id", id)),
  setPoFields: async (id, patch) => must(await sb.from("pos").update(patch).eq("id", id)),
  insertPo: async row => must(await sb.from("pos").insert(row)),
  setPoOpen: async (id, open) => must(await sb.from("pos").update({ open }).eq("id", id)),
  deletePo: async id => must(await sb.from("pos").delete().eq("id", id)),
  saveSettings: async data => must(await sb.from("settings").upsert({ id:"shop", data })),
  extendPay: async (gid, phone) => must(await sb.rpc("extend_pay", { p_gid:gid, phone })),
  secretStatus: async () => must(await sb.rpc("secret_status")),
  setSecret: async (key, value) => must(await sb.rpc("set_secret", { p_key:key, p_value:value })),
  notifyTest: async hp => must(await sb.rpc("notify_test", { p_hp:hp })),
  loadNotifyQueue: async () => must(await sb.from("notify_queue").select("*").order("id", { ascending:false }).limit(12)),
  adminList: async () => must(await sb.rpc("admin_list")),
  adminAdd: async email => must(await sb.rpc("admin_add", { p_email:email })),
  adminRemove: async email => must(await sb.rpc("admin_remove", { p_email:email })),
  claimPaid: async (gid, phone) => must(await sb.rpc("claim_paid", { p_gid:gid, phone })),
  editItems: async (id, qty) => must(await sb.rpc("admin_edit_items", { p_id:id, p_qty:qty })),
  logAct: async (action, target, detail) => { try { await sb.from("activity_log").insert({ actor:(session && session.user && session.user.email) || "", action, target, detail }); } catch (e) {} },
  loadNotes: async () => must(await sb.from("customer_notes").select("*")),
  saveNote: async (hp, note) => must(await sb.from("customer_notes").upsert({ hp, note, updated_at:new Date().toISOString() })),
  loadLog: async () => must(await sb.from("activity_log").select("*").order("at", { ascending:false }).limit(60)),
  updateOrders: async (ids, patch) => must(await sb.from("orders").update(patch).in("id", ids)),
  createOrders: async (payload, asAdmin) => must(await sb.rpc("create_orders", { payload, as_admin:!!asAdmin })),
  loadRemaining: async () => must(await sb.rpc("po_remaining")),
  uploadProof: async (gid, blob) => {
    const path = gid + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + ".jpg";
    must(await sb.storage.from("proofs").upload(path, blob, { contentType:blob.type || "image/jpeg", cacheControl:"3600", upsert:false })); return path;
  },
  cancelOrders: async (gid, phone) => must(await sb.rpc("cancel_orders", { p_gid:gid, phone })),
  attachProof: async (gid, phone, path) => must(await sb.rpc("attach_proof", { p_gid:gid, phone, p_path:path })),
  proofUrl: async path => { const r = await sb.storage.from("proofs").createSignedUrl(path, 600); if (r.error) throw r.error; return r.data.signedUrl; },
  trackOrders: async (ids, phone) => must(await sb.rpc("track_orders", { ids, phone }))
};
let remaining = {};                // sisa kuota: "poId::pid" -> angka (hanya menu yang punya kuota)
const remainOf = (poId, pid) => Object.prototype.hasOwnProperty.call(remaining, poId + "::" + pid) ? remaining[poId + "::" + pid] : null;
const serverClosed = new Set();   // tanggal PO yang ditolak server (jam server lebih akurat dari jam perangkat)

let products = null, pos = null;   // null sampai data pertama dimuat
let settings = { ...DEFAULT_SETTINGS };
let view = "shop";
const cart = {};                   // kunci: poId::produk, poId::produk::indeksVarian, atau poId::produk::+idAddon
let activePo = null, activeChosen = false, menuShown = false, fulfil = "antar";   // activeChosen: pembeli sendiri yang memilih tanggal
let placed = [], recorded = false, trackConf = {};

const shopList = () => dbState === "none" ? DEFAULT_PRODUCTS : products;
const poList = () => dbState === "none" ? DEFAULT_POS : pos;
/* PO ditutup otomatis pada hari H pukul 10.00 WIB (jam bisa diubah di Pengaturan). */
const cutoffTime = po => /^\d{2}:\d{2}$/.test((po && po.cutoff) || "") ? po.cutoff : /^\d{1,2}[:.]\d{2}$/.test(settings.poCutoff || "") ? settings.poCutoff.replace(".", ":").padStart(5, "0") : "10:00";
const cutoffLabel = po => cutoffTime(po).replace(":", ".");
const cutoffAt = po => Date.parse(`${po.date}T${cutoffTime(po)}:00+07:00`);
const isPast = po => Date.now() >= cutoffAt(po);
const notYet = po => !!po.opens_at && Date.parse(po.opens_at) > Date.now();
const poScheduled = po => po.open === true && notYet(po) && !isPast(po);
const poOpenNow = po => po.open === true && !isPast(po) && !serverClosed.has(po.date) && !notYet(po);
const fmtWhen = iso => new Intl.DateTimeFormat("id-ID", { timeZone:"Asia/Jakarta", weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(iso));
const openPos = () => (poList() || []).filter(poOpenNow).sort((a, b) => String(a.date).localeCompare(String(b.date)));
const hours = () => settings.deliveryHours || "12.00 - 14.00";
const pickHours = () => settings.pickupHours || hours();
const pickLoc = () => settings.pickupLocation || "Bassura City Mall, Lobi Selatan";
const isPick = () => fulfil === "ambil";
const hoursFor = f => f === "ambil" ? pickHours() : hours();
const flat = () => Number(settings.ongkir) || 0;
const ongkir = () => isPick() ? 0 : flat();
const imgSrc = p => p.imageUrl || "";
/* Varian: "Nama" atau "Nama=harga". Tanpa harga, ikut harga menu. */
const optsOf = p => (Array.isArray(p.options) ? p.options : []).map(s => String(s).trim()).filter(Boolean).map(s => {
  const i = s.lastIndexOf("="), digits = i > 0 ? s.slice(i + 1).replace(/\D/g, "") : "", custom = i > 0 && digits !== "";
  return { name:(i > 0 ? s.slice(0, i) : s).trim(), price:custom ? Number(digits) : Number(p.price) || 0, custom };
}).filter(o => o.name);
/* Varian "Ukuran - Pilihan" dikelompokkan per ukuran. */
function variantsHTML(p, keyBase, mk){
  const opts = optsOf(p), showP = opts.some(o => o.custom), groups = [];
  opts.forEach((o, j) => {
    const i = o.name.indexOf(" - "), g = i > 0 ? o.name.slice(0, i).trim() : "", label = i > 0 ? o.name.slice(i + 3).trim() : o.name;
    let G = groups[groups.length - 1]; if (!G || G.title !== g) { G = { title:g, rows:[] }; groups.push(G); }
    G.rows.push({ o, j, label });
  });
  return groups.map(G => `<div class="vgroup">${G.title ? `<div class="vtitle">${esc(G.title)}</div>` : ""}${G.rows.map(r => `<div class="vrow ${showP ? "wp" : ""}"><span>${esc(r.label)}</span>${showP ? `<span class="vp">${rp(r.o.price)}</span>` : ""}${mk(keyBase + "::" + r.j, p.name + " " + r.o.name)}</div>`).join("")}</div>`).join("");
}
const openItems = new Set();
const fromPrice = p => { const o = optsOf(p); return o.length ? Math.min(...o.map(x => x.price)) : Number(p.price) || 0; };
const addonsOf = p => Array.isArray(p.addons) ? p.addons.filter(a => a && a.id && a.name) : [];
const addonKey = (poId, pid, aid) => `${poId}::${pid}::+${aid}`;
const isAddonKey = k => (k.split("::")[2] || "").startsWith("+");
const parseAddons = s => s.split(",").map(x => x.trim()).filter(Boolean).map(x => {
  const [n, pr] = x.split("="), name = (n || "").trim();
  return { id:name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, price:Math.max(0, Math.round(Number(String(pr || "0").replace(/\D/g, "")) || 0)) };
}).filter(a => a.id && a.name);
const fmtAddons = p => addonsOf(p).map(a => `${a.name}=${a.price}`).join(", ");
const normPhone = h => { const d = String(h).replace(/\D/g, ""); return d.startsWith("0") ? "62" + d.slice(1) : d; };
const AREAS = ["Jakarta Pusat", "Jakarta Utara", "Jakarta Barat", "Jakarta Selatan", "Jakarta Timur"];

/* ================= TOKO ================= */
const mainQty = (poId, pid) => Object.keys(cart).filter(k => k.split("::")[0] === poId && k.split("::")[1] === pid && !isAddonKey(k)).reduce((a, k) => a + cart[k], 0);
const clampAddons = (poId, pid) => { const m = mainQty(poId, pid); Object.keys(cart).forEach(k => { const s = k.split("::"); if (isAddonKey(k) && s[0] === poId && s[1] === pid && cart[k] > m) { if (m > 0) cart[k] = m; else delete cart[k]; } }); };
function resolveKey(k, list){
  const [poId, pid, idx] = k.split("::");
  const po = openPos().find(x => x.id === poId); if (!po) return null;
  const p = (list || []).find(x => x.id === pid); if (!p || p.available === false) return null;
  if (idx === undefined) return optsOf(p).length ? null : { po, p, option:"" };
  if (idx.startsWith("+")) { const a = addonsOf(p).find(x => x.id === idx.slice(1)); return a ? { po, p, addon:a } : null; }
  const o = optsOf(p)[Number(idx)];
  return o ? { po, p, option:o.name, price:o.price } : null;
}
const stepper = (key, label, plusOff) => `<div class="step" data-key="${esc(key)}">
  <button type="button" data-d="-1" aria-label="Kurangi ${esc(label)}">−</button>
  <span data-q>${cart[key] || 0}</span>
  <button type="button" data-d="1" aria-label="Tambah ${esc(label)}" ${plusOff ? "disabled" : ""}>+</button></div>`;
const countFor = poId => Object.keys(cart).filter(k => k.startsWith(poId + "::") && !isAddonKey(k)).reduce((a, k) => a + cart[k], 0);

function renderPoChips(){
  const el = $("pochips"), list = openPos();
  if (poList() === null || !list.length) { el.innerHTML = ""; $("menu-h").textContent = "Pilih menu"; return; }
  if (!activeChosen || !list.some(x => x.id === activePo)) activePo = list[0].id;
  el.innerHTML = list.map(po => { const n = countFor(po.id);
    return `<button type="button" class="cbtn" data-po="${esc(po.id)}" aria-pressed="${po.id === activePo}">${po.id === activePo ? ic("check") : ""}<span class="dow">${esc(relDay(po.date) || fmtD(po.date, { weekday:"short" }))}</span><span class="dnum">${esc(fmtD(po.date, { day:"numeric" }))}</span><span class="mon">${esc(fmtD(po.date, { month:"short" }))}</span>${n ? `<span class="cnt" aria-label="${n} porsi dipilih">${n}</span>` : ""}</button>`; }).join("");
  const cur = list.find(x => x.id === activePo) || list[0];
  $("menu-h").textContent = "Menu untuk " + (relDay(cur.date) ? relDay(cur.date).toLowerCase() : dShort(cur.date));
  const hr = s => s.replace(/\s*-\s*/, "-");
  $("sc-hours").textContent = hours() === pickHours() ? hr(hours()) : hr(hours()) + ", " + hr(pickHours());
  document.querySelector(".sc-i small").hidden = hours() !== pickHours();
  renderCountdown();
}
$("pochips").addEventListener("click", e => {
  const b = e.target.closest("[data-po]"); if (!b) return;
  activePo = b.dataset.po; activeChosen = true; renderMenu();
});

function renderMenu(){
  const el = $("menu"), list = shopList(), pl = openPos();
  $("shop").classList.toggle("is-error", dbState === "error");
  renderPoChips();
  if (dbState === "error") { el.innerHTML = `<div class="empty">Menu belum bisa dimuat.<br><button class="btn sm" data-retry type="button" style="display:inline-flex;margin-top:12px">${ic("undo")}Coba lagi</button></div>`; $("closed").hidden = true; $("po-wrap").hidden = false; updateBar(); return; }
  if (!list || poList() === null) { el.innerHTML = SKEL; $("closed").hidden = true; updateBar(); return; }
  if (canPrune()) for (const k of Object.keys(cart)) if (!resolveKey(k, list)) delete cart[k];
  $("closed").hidden = pl.length > 0; $("po-wrap").hidden = pl.length === 0;
  if (!pl.length) { updateBar(); return; }
  if (!list.length) { el.innerHTML = '<div class="empty">Menu belum tersedia. Silakan cek lagi nanti.</div>'; updateBar(); return; }
  const act = pl.find(x => x.id === activePo) || pl[0];
  el.innerHTML = list.map((p, i) => {
    const opts = optsOf(p), adds = addonsOf(p), k = act.id + "::" + p.id, img = imgSrc(p), rem = remainOf(act.id, p.id), off = p.available === false || rem === 0, showP = opts.some(o => o.custom);
    const thumb = img ? `<img class="thumb" src="${esc(img)}" alt="${esc(p.name)}" width="96" height="96" loading="${i < 2 ? "eager" : "lazy"}" decoding="async" data-fallback="${esc(p.emoji || "🍽️")}">` : `<div class="thumb tile" aria-hidden="true">${esc(p.emoji || "🍽️")}</div>`;
    const custom = !off && (opts.length > 0 || adds.length > 0);
    const ctl = off ? '' : custom ? '<button type="button" class="addbtn" data-pick aria-haspopup="dialog" aria-expanded="false">Tambah</button>' : stepper(k, p.name);
    const addsHTML = !off && adds.length ? `<div class="subs adds" data-po="${esc(act.id)}" data-pid="${esc(p.id)}" hidden><div class="subs-title">Tambahan</div>${adds.map(a => { const ak = addonKey(act.id, p.id, a.id);
      return `<div class="sub"><span>${esc(a.name)}<em>${a.price ? "+" + rp(a.price) : "gratis"}</em></span>${stepper(ak, a.name + " untuk " + p.name, (cart[ak] || 0) >= mainQty(act.id, p.id))}</div>`; }).join("")}</div>` : "";
    const note = off || p.note === false ? "" : `<div class="noterow" hidden><input type="text" class="inote" data-note value="${esc(itemNotes[k] || "")}" maxlength="120" placeholder="Catatan, contoh: tidak pakai cabai" aria-label="Catatan untuk ${esc(p.name)}"></div>`;
    const priceTxt = `${showP ? "dari " : ""}${rp(showP ? fromPrice(p) : p.price)}`;
    const sheet = custom ? `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-${esc(p.id)}">
        <span class="sheet-grab" aria-hidden="true"></span>
        <div class="sheet-h"><div><h3 id="sh-${esc(p.id)}" tabindex="-1">${esc(p.name)}</h3><p>${esc(p.desc)}</p><b class="price">${priceTxt}</b></div><button type="button" class="sheet-x" data-close aria-label="Tutup">${ic("x")}</button></div>
        <div class="sheet-b">
          <div class="sg"><div class="sg-h"><b>${opts.length ? "Pilih varian" : "Jumlah"}</b><small>${opts.length ? "Boleh lebih dari satu" : ""}</small></div>${opts.length ? variantsHTML(p, k, stepper) : `<div class="vrow"><span>Porsi</span>${stepper(k, p.name)}</div>`}</div>
          ${addsHTML ? `<div class="sg">${addsHTML}</div>` : ""}
          ${note ? `<div class="sg"><div class="sg-h"><b>Catatan</b></div>${note}</div>` : ""}
        </div>
        <div class="sheet-f"><button type="button" class="btn" data-close>Selesai<span data-sub></span></button></div>
      </div>` : "";
    return `<div class="item ${off ? "off" : ""}" data-pid="${esc(p.id)}" data-po="${esc(act.id)}" style="--i:${i}">
      <div class="ihead"><div class="ibody"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="irow2"><span class="price">${priceTxt}</span>${off ? '<span class="left sold">Habis</span>' : rem != null && rem > 0 && rem <= 10 ? `<span class="left">sisa ${rem}</span>` : ""}</div></div>${thumb}</div>
      <div class="ifoot">${custom ? `<span class="cust">${ic("settings")}Bisa disesuaikan</span>` : "<span></span>"}${ctl}</div>
      ${sheet}${custom ? "" : note}</div>`;
  }).join("");
  syncMenuDom();
  if (!menuShown) { menuShown = true; el.classList.add("enter"); setTimeout(() => el.classList.remove("enter"), 1000); }
  updateBar();
}
const itemSubtotal = (po, pid) => lines().filter(l => l.poId === po && l.pid === pid).reduce((t, l) => t + l.sub, 0);
function syncMenuDom(){
  document.querySelectorAll("#menu [data-key]").forEach(ctl => {
    const k = ctl.dataset.key, [poId, pid] = k.split("::");
    ctl.querySelector("[data-q]").textContent = cart[k] || 0;
    if (isAddonKey(k)) ctl.querySelector('[data-d="1"]').disabled = (cart[k] || 0) >= mainQty(poId, pid);
  });
  document.querySelectorAll("#menu .adds").forEach(el => { el.hidden = mainQty(el.dataset.po, el.dataset.pid) === 0; });
  document.querySelectorAll("#menu .item").forEach(it => {
    const po = it.dataset.po, pid = it.dataset.pid, open = openItems.has(po + "::" + pid), btn = it.querySelector("[data-pick]");
    it.classList.toggle("on", mainQty(po, pid) > 0);
    const nr = it.querySelector(".noterow"); if (nr) nr.hidden = mainQty(po, pid) === 0;
    if (!btn) return;
    const q = mainQty(po, pid);
    it.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
    btn.textContent = q > 0 ? q + " porsi" : "Tambah"; btn.classList.toggle("has", q > 0);
    const sub = it.querySelector("[data-sub]"); if (sub) sub.textContent = q > 0 ? " - " + rp(itemSubtotal(po, pid)) : "";
  });
  const anyOpen = openItems.size > 0; $("scrim").hidden = !anyOpen; document.body.classList.toggle("sheet-open", anyOpen);
}
let sheetOpener = null;
let editBack = false;
function closeSheets(){
  if (!openItems.size) return;
  openItems.clear(); syncMenuDom();
  if (editBack) { editBack = false; sheetOpener = null; if (qtyTotal()) go(2); else go(1); return; }
  if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
  sheetOpener = null;
}
$("scrim").onclick = closeSheets;
document.addEventListener("keydown", e => {
  if (!openItems.size) return;
  if (e.key === "Escape") { closeSheets(); return; }
  if (e.key !== "Tab") return;
  const f = [...document.querySelectorAll(".item.open .sheet button:not(:disabled), .item.open .sheet input:not([type=hidden])")].filter(x => x.offsetParent);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1], inside = document.activeElement && document.activeElement.closest(".sheet");
  if (!inside || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
$("menu").addEventListener("click", e => {
  const cl = e.target.closest("[data-close]");
  if (cl) { closeSheets(); return; }
  const pb = e.target.closest("[data-pick]");
  if (pb) { const it = pb.closest(".item"), id = it.dataset.po + "::" + it.dataset.pid; if (openItems.has(id)) { closeSheets(); return; } openItems.add(id); sheetOpener = pb; syncMenuDom(); const hd = it.querySelector(".sheet h3"); if (hd) hd.focus(); track("buka_pilihan", { menu:it.dataset.pid }); return; }
  const b = e.target.closest("button[data-d]"); if (!b) return;
  if (!bumpCart(b.closest("[data-key]").dataset.key, Number(b.dataset.d))) return;
  syncMenuDom(); renderPoChips(); updateBar();
});
function bumpCart(key, delta){
  const [poId, pid] = key.split("::"), rem = isAddonKey(key) ? null : remainOf(poId, pid);
  if (delta > 0 && rem != null && mainQty(poId, pid) >= rem) { toast("Sisa " + rem + " porsi untuk menu ini"); return false; }
  cart[key] = Math.max(0, (cart[key] || 0) + delta);
  if (!cart[key]) delete cart[key];
  if (!isAddonKey(key)) clampAddons(poId, pid);
  return true;
}


const itemNotes = {};
$("menu").addEventListener("click", e => { if (e.target.closest("[data-retry]")) { dbState = "loading"; products = null; renderMenu(); refreshProducts(); refreshPos(); } });
$("menu").addEventListener("input", e => {
  if (!e.target.matches("[data-note]")) return;
  const it = e.target.closest(".item"); itemNotes[it.dataset.po + "::" + it.dataset.pid] = e.target.value; saveCart();
});
const lines = () => {
  const list = shopList() || [];
  return Object.keys(cart).filter(k => cart[k] > 0).map(k => {
    const r = resolveKey(k, list); if (!r) return null;
    const a = r.addon, price = Number(a ? a.price : r.price != null ? r.price : r.p.price) || 0, pi = list.findIndex(x => x.id === r.p.id);
    const sub = a ? addonsOf(r.p).findIndex(x => x.id === a.id) : Math.max(0, optsOf(r.p).findIndex(x => x.name === r.option));
    const part = k.split("::")[2];
    return { poId:r.po.id, date:r.po.date, pid:r.p.id, name:a ? a.name : r.p.name, option:a ? "untuk " + r.p.name : r.option, addon:!!a,
      optIdx:!a && part !== undefined ? Number(part) : null, addonId:a ? a.id : null,
      price, qty:cart[k], sub:cart[k] * price, ord:pi * 1000 + (a ? 500 : 0) + sub };
  }).filter(Boolean).sort((x, y) => x.ord - y.ord);
};
const qtyTotal = () => lines().filter(l => !l.addon).reduce((a, l) => a + l.qty, 0);
function groups(){
  const m = {}, seen = {};
  lines().forEach(l => {
    if (!m[l.poId]) m[l.poId] = { poId:l.poId, date:l.date, items:[], food:0 };
    const nk = l.poId + "::" + l.pid; let note = "";
    if (!l.addon && !seen[nk]) { seen[nk] = 1; note = (itemNotes[nk] || "").trim(); }
    m[l.poId].items.push({ pid:l.pid, name:l.name, option:l.option, addon:l.addon, optIdx:l.optIdx, addonId:l.addonId, note, price:l.price, qty:l.qty }); m[l.poId].food += l.sub;
  });
  return Object.values(m).sort((a, b) => a.date.localeCompare(b.date)).map(g => ({ ...g, fulfil, ongkir:ongkir(), total:g.food + ongkir() }));
}
const grand = gs => gs.reduce((a, g) => a + g.total, 0);
let stateReady = false;
function saveCart(){ if (stateReady) lsSet(LS.cart, { cart, notes:itemNotes, po:activePo, fulfil }); }
let mapsUrl = "";   // tautan Google Maps dari alamat yang dipilih pembeli
function saveCust(){ if (stateReady) lsSet(LS.cust, { nama:$("nama").value, hp:$("hp").value, area:$("area").value, alamat:$("alamat").value, maps:mapsUrl, q:$("addr-q").value }); }
function restoreState(){
  const c = lsGet(LS.cart);
  if (c && c.cart) { Object.assign(cart, c.cart); Object.assign(itemNotes, c.notes || {}); if (c.po && Object.keys(c.cart).length) { activePo = c.po; activeChosen = true; }
    if (c.fulfil === "ambil") { fulfil = "ambil"; const r = document.querySelector("[name=fulfil][value=ambil]"); if (r) r.checked = true; } }
  const u = lsGet(LS.cust);
  if (u) { ["nama", "hp", "alamat"].forEach(k => { if (u[k]) $(k).value = u[k]; }); if (u.area) $("area").value = u.area; if (mapsSafe(u.maps) && u.q) { mapsUrl = u.maps; $("addr-q").value = u.q; showAddrHint(true); } }
  stateReady = true;
}
/* sisa waktu sebelum PO tutup; hanya ditampilkan di bawah 24 jam */
function cutoffLeft(po){
  const ms = cutoffAt(po) - Date.now(); if (ms <= 0 || ms >= 864e5) return null;
  const m = Math.max(1, Math.floor(ms / 6e4)), h = Math.floor(m / 60);
  return { text:(h >= 1 ? h + " jam" : m + " menit") + " lagi", urgent:ms < 3 * 36e5 };
}
function renderCountdown(){
  const act = openPos().find(x => x.id === activePo) || openPos()[0]; if (!act) return;
  const left = cutoffLeft(act);
  $("cutnote").hidden = !left; $("sc-cut").textContent = left ? left.text : "";
  $("sc-cut").classList.toggle("urgent", !!(left && left.urgent));
}
/* layar PO kosong: kalau admin sudah menjadwalkan PO, tampilkan tanggal dan jam bukanya */
function renderClosed(){
  const n = (poList() || []).filter(poScheduled).sort((x, y) => String(x.date).localeCompare(String(y.date)))[0];
  const msg = n ? `Halo admin Lapo Doli, tolong kabari saya saat PO ${dShort(n.date)} dibuka.` : "Halo admin Lapo Doli, kapan PO berikutnya dibuka?";
  $("closed-wa").href = `https://wa.me/${settings.waNumber}?text=${encodeURIComponent(msg)}`;
  $("closed-h").textContent = n ? "PO segera dibuka" : "PO belum dibuka";
  $("closed-p").hidden = !!n;
  $("np").hidden = !n; if (n) $("np").innerHTML = `<span>${ic("po")}PO ${esc(dShort(n.date))}</span><span>${ic("clock")}Buka ${esc(fmtWhen(n.opens_at))}</span>`;
  $("closed-wa-t").textContent = n ? "Ingatkan saya" : "Chat admin";
}
/* teks yang bergantung pada pengaturan dan jadwal PO; dipanggil saat keduanya berubah */
function renderStatic(){
  document.querySelectorAll("[data-hours]").forEach(x => { x.textContent = hours(); });
  document.querySelectorAll("[data-ongkir]").forEach(x => { x.textContent = flat() ? rp(flat()) : "Gratis"; });
  document.querySelectorAll("[data-pickloc]").forEach(x => { x.textContent = pickLoc(); });
  document.querySelectorAll("[data-pickhours]").forEach(x => { x.textContent = pickHours(); });
  document.querySelectorAll("[data-cutoff]").forEach(x => { x.textContent = cutoffLabel(); });
  document.querySelectorAll("[data-paywin]").forEach(x => { x.textContent = payWinText(); });
  const hn = $("hp-note"); if (hn) hn.hidden = settings.notifyOn !== true;
  $("help-wa").href = `https://wa.me/${settings.waNumber}?text=${encodeURIComponent("Halo admin Lapo Doli, saya mau tanya soal pesanan.")}`;
  renderClosed();
}
/* isi ulang keranjang dari pesanan terakhir, dipetakan ke PO yang sedang dibuka */
function renderReorder(){
  const snap = lsGet(LS.snap), mains = snap ? Object.keys(snap.cart).filter(k => !isAddonKey(k)).reduce((t, k) => t + snap.cart[k], 0) : 0;
  const show = screen === 1 && mains > 0 && !qtyTotal() && openPos().length > 0 && dbState === "ok";
  $("reorder").hidden = !show; if (show) $("reorder-t").textContent = "Pesan seperti sebelumnya (" + mains + " porsi)";
  syncQuick();
}
function syncQuick(){ const q = $("quick"); if (q) q.hidden = $("lastorder").hidden && $("reorder").hidden; }
function reorder(){
  const snap = lsGet(LS.snap), po = openPos().find(x => x.id === activePo) || openPos()[0]; if (!snap || !po) return;
  let skipped = 0; const pids = new Set();
  Object.keys(snap.cart).forEach(k => {
    const rest = k.split("::").slice(1), nk = [po.id, ...rest].join("::");
    if (!resolveKey(nk, shopList())) { if (!isAddonKey(k)) skipped++; return; }
    cart[nk] = (cart[nk] || 0) + snap.cart[k]; pids.add(rest[0]);
  });
  pids.forEach(pid => {   /* batasi dengan sisa kuota, lalu rapikan tambahan */
    const rem = remainOf(po.id, pid);
    if (rem != null) Object.keys(cart).filter(k => k.startsWith(po.id + "::" + pid + "::") && !isAddonKey(k)).forEach(k => { const over = mainQty(po.id, pid) - rem; if (over > 0) { cart[k] = Math.max(0, cart[k] - over); if (!cart[k]) delete cart[k]; skipped++; } });
    clampAddons(po.id, pid);
  });
  Object.keys(snap.notes || {}).forEach(k => { const pid = k.split("::")[1]; if (pids.has(pid)) itemNotes[po.id + "::" + pid] = snap.notes[k]; });
  if (snap.fulfil === "ambil") { fulfil = "ambil"; const r = document.querySelector("[name=fulfil][value=ambil]"); if (r) r.checked = true; }
  const kept = qtyTotal(); track("pesan_lagi", { porsi:kept });
  renderMenu(); updateBar();
  toast(!kept ? "Menu sebelumnya sedang tidak tersedia." : skipped ? "Sebagian menu tidak tersedia atau kuotanya kurang. Cek keranjangmu." : "Keranjang diisi dari pesanan sebelumnya.");
}
$("reorder").onclick = reorder;
function updateBar(){
  saveCart();
  const gs = groups();
  $("count").textContent = qtyTotal() + " porsi" + (gs.length > 1 ? ", " + gs.length + " tanggal" : gs.length ? ", " + dShort(gs[0].date) : "");
  $("subtotal").textContent = rp(gs.reduce((a, g) => a + g.food, 0));
  $("next").disabled = qtyTotal() === 0;
  const noPo = screen === 1 && poList() !== null && openPos().length === 0;
  renderReorder();
  $("bar").hidden = screen !== 1 || noPo || qtyTotal() === 0; $("shop").classList.toggle("no-po", noPo);
}
function summaryHTML(gs, kode = 0){
  const h = gs.map(g => `<div class="gh">${g.fulfil === "ambil" ? "Ambil" : "Antar"} ${esc(dShort(g.date))}, ${esc(hoursFor(g.fulfil))}</div>` +
    g.items.filter(l => Number(l.qty) > 0).map(l => `<div><span>${l.qty} × ${esc(l.name)}${l.option ? " (" + esc(l.option) + ")" : ""}</span><span>${l.price ? rp(l.price * l.qty) : "Gratis"}</span></div>${l.note ? `<div class="lnote">Catatan: ${esc(l.note)}</div>` : ""}`).join("") +
    (g.ongkir ? `<div><span>Ongkir Lalamove</span><span>${rp(g.ongkir)}</span></div>` : g.fulfil === "ambil" ? "<div><span>Ambil sendiri</span><span>Tanpa ongkir</span></div>" : "")).join("");
  return h + (kode ? `<div><span>Kode unik</span><span>${rp(kode)}</span></div>` : "") + `<div class="total"><span>Total</span><span>${rp(grand(gs) + kode)}</span></div>`;
}

/* --- layar: 1 pesan, 2 checkout, 3 selesai --- */
let screen = 1, openSig = "";
function pruneClosed(){
  if (!canPrune()) return [];
  const ids = new Set(openPos().map(p => p.id)), gone = new Set();
  Object.keys(cart).forEach(k => { const pid = k.split("::")[0]; if (!ids.has(pid)) { gone.add(pid); delete cart[k]; } });
  return [...gone].map(id => { const po = (poList() || []).find(x => x.id === id); return po ? dShort(po.date) : id; });
}
function checkClosings(){
  if (screen === 3) renderTtl();
  if (poList() === null) return;
  renderCountdown();
  const gone = pruneClosed(), sig = openPos().map(p => p.id).join();
  if (!gone.length && sig === openSig) return;
  openSig = sig; renderMenu();
  if (gone.length) { toast("PO " + gone.join(", ") + " sudah ditutup dan dihapus dari pesananmu"); if (screen === 2) { if (qtyTotal()) renderCheckout(); else go(1); } }
}
function updateSteps(n){
  const bk = $("back1");
  if (n === 2) { bk.setAttribute("role", "button"); bk.setAttribute("tabindex", "0"); bk.setAttribute("aria-label", "Kembali ke menu"); } else { bk.removeAttribute("role"); bk.removeAttribute("tabindex"); bk.removeAttribute("aria-label"); }
  const mb = $("mb-back"); mb.setAttribute("aria-label", n === 3 ? "Ke beranda" : "Kembali ke menu");
  document.querySelectorAll("#steps li, #steps2 li").forEach((li, j) => { const i = j % 3; const k = i + 1; li.className = k < n ? "done" : k === n ? "now" : ""; li.querySelector("i").innerHTML = k < n ? ic("check") : String(k); li.setAttribute("aria-current", k === n ? "step" : "false"); });
}
function go(n){
  screen = n;
  document.querySelectorAll("#shop section").forEach((s, i) => s.classList.toggle("show", i + 1 === n));
  $("bar").hidden = n !== 1 || qtyTotal() === 0; $("shop").classList.toggle("has-bar", n === 1 && qtyTotal() > 0); $("shop").classList.toggle("home", n === 1);
  updateSteps(n); openItems.clear(); sheetOpener = null; if (n !== 1) editBack = false;
  if (n === 2) renderCheckout();
  renderReorder();
  window.scrollTo({ top:0 });
}
$("next").onclick = () => { track("mulai_checkout", { porsi:qtyTotal() }); go(2); };
$("addmore").onclick = () => go(1);
/* di layar Data, langkah "Menu" di atas menjadi tombol kembali */
$("back1").onclick = () => { if (screen === 2) go(1); };
$("mb-back").onclick = () => { closeSheets(); if (screen === 2) go(1); else { setView("shop"); go(1); } };
$("back1").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && screen === 2) { e.preventDefault(); go(1); } });

const lineKey = (poId, l) => l.addon ? addonKey(poId, l.pid, l.addonId) : l.optIdx != null ? `${poId}::${l.pid}::${l.optIdx}` : `${poId}::${l.pid}`;
function itemsHTML(gs){
  return gs.map(g => {
    const row = l => {
      const k = lineKey(g.poId, l), plusOff = l.addon && (cart[k] || 0) >= mainQty(g.poId, l.pid);
      if (l.addon) return `<div class="li add"><div class="ln"><span class="n">${esc(l.name)}</span><span class="p">${l.price ? rp(l.price * l.qty) : "Gratis"}</span></div>${stepper(k, l.name, plusOff)}</div>`;
      const pr = shopList().find(x => x.id === l.pid), im = pr ? imgSrc(pr) : "";
      const th = im ? `<img class="thumb lthumb" src="${esc(im)}" alt="" width="56" height="56" loading="lazy" decoding="async" data-fallback="${esc((pr && pr.emoji) || "🍽️")}">` : `<span class="thumb tile lthumb" aria-hidden="true">${esc((pr && pr.emoji) || "🍽️")}</span>`;
      return `<div class="li">${th}<div class="ln"><span class="n">${esc(l.name)}</span>${l.option ? `<small>${esc(l.option)}</small>` : ""}${l.note ? `<small class="nt">${esc(l.note)}</small>` : ""}<span class="meta"><span class="p">${l.price ? rp(l.price * l.qty) : "Gratis"}</span>${pr && (optsOf(pr).length || addonsOf(pr).length || pr.note !== false) ? `<button type="button" class="editline" data-edit="${esc(g.poId + "::" + l.pid)}">Ubah</button>` : ""}</span></div>${stepper(k, l.name, plusOff)}</div>`;
    };
    const mains = g.items.filter(l => !l.addon), adds = g.items.filter(l => l.addon), seen = {};
    return `<div class="gh2">${ic("po")}<span>${g.fulfil === "ambil" ? "Ambil" : "Antar"} ${esc(dShort(g.date))}</span><small>${esc((g.fulfil === "ambil" ? pickHours() : hours()).replace(/\s*-\s*/, "-"))}</small></div>` + mains.map(l => {
      const first = !seen[l.pid]; seen[l.pid] = 1;
      return `<div class="lg">${row(l)}${first ? adds.filter(x => x.pid === l.pid).map(row).join("") : ""}</div>`;
    }).join("");
  }).join("");
}
$("sum-items").addEventListener("click", e => {
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    const id = ed.dataset.edit; go(1); editBack = true;
    const it = [...document.querySelectorAll("#menu .item")].find(x => x.dataset.po + "::" + x.dataset.pid === id);
    if (!it) { editBack = false; go(2); return; }
    openItems.add(id); sheetOpener = null; syncMenuDom(); it.scrollIntoView({ block:"center" });
    const hd = it.querySelector(".sheet h3"); if (hd) hd.focus({ preventScroll:true });
    track("ubah_item", { menu:it.dataset.pid }); return;
  }
  const b = e.target.closest("button[data-d]"); if (!b) return;
  if (!bumpCart(b.closest("[data-key]").dataset.key, Number(b.dataset.d))) return;
  syncMenuDom(); renderPoChips(); updateBar();
  if (!qtyTotal()) { toast("Keranjang kosong. Pilih menu dulu."); go(1); } else renderCheckout();
});
function payRowsHTML(gs){
  const food = gs.reduce((t, g) => t + g.food, 0), fee = gs.reduce((t, g) => t + (g.ongkir || 0), 0);
  return `<div><span>Harga</span><span>${rp(food)}</span></div>` + (fee ? `<div><span>Ongkir</span><span>${rp(fee)}</span></div>` : `<div><span>Ongkir</span><span>Gratis</span></div>`) + `<div class="total"><span>Total pembayaran</span><span>${rp(grand(gs))}</span></div>`;
}
function renderCheckout(){
  const gsx = groups();
  $("sum-items").innerHTML = itemsHTML(gsx); $("sum2").innerHTML = payRowsHTML(gsx); $("cb-total").textContent = rp(grand(gsx)); $("cb-count").textContent = gsx.reduce((t, g) => t + g.items.filter(l => !l.addon).reduce((x, l) => x + l.qty, 0), 0) + " porsi";
  $("pick-line").textContent = pickLoc();
  $("addr-fields").hidden = isPick(); $("pick-box").hidden = true;
  $("pick-loc").textContent = pickLoc(); $("pick-hours").textContent = pickHours();
  renderPayInfo();
}
let placedClaimed = false, placedPay = { total:0, kode:0, method:"transfer" }, payVisible = false, placedProof = false, placedRejected = false, placedAt = 0;
/* batas bayar: diatur admin (menit), sama dengan aturan server */
const payMin = () => Math.max(15, Math.min(240, Math.round(Number(settings.payWindowMin) || 60)));
const payWinText = () => { const m = payMin(); return m % 60 === 0 ? m / 60 + " jam" : m + " menit"; };
const lateAt = o => new Date(o.createdAt).getTime() + (payMin() + (Number(o.extraMin) || 0)) * 6e4;
let placedDeadline = 0, placedExtended = false;
function renderTtl(){
  const el = $("d-ttl"), on = payVisible && !placedProof && placedAt > 0;
  el.hidden = !on; if (!on) { $("ttl-extend").hidden = true; return; }
  const ms = (placedDeadline > placedAt ? placedDeadline : placedAt + payMin() * 6e4) - Date.now(), s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), d = s % 60;
  el.classList.toggle("late", ms <= 0); el.classList.toggle("urgent", ms > 0 && ms < 10 * 6e4);
  $("ttl-extend").hidden = !(ms > 0 && ms < 20 * 6e4 && !placedExtended);
  el.textContent = ms <= 0 ? "Batas waktu bayar sudah lewat. Pesanan tanpa bukti dibatalkan otomatis. Unggah bukti sekarang atau hubungi admin." : "Bayar dalam " + (m >= 1 ? m + " menit " + d + " detik" : d + " detik") + " supaya porsimu aman.";
}
setInterval(() => { if (screen === 3 && !document.hidden && !$("d-ttl").hidden) renderTtl(); }, 1000);
document.querySelectorAll("[name=fulfil]").forEach(r => r.onchange = () => { fulfil = document.querySelector("[name=fulfil]:checked").value; saveCart(); renderCheckout(); });
function renderPayInfo(){
  const hasQ = !!settings.qrisUrl;
  $("paymethod-wrap").hidden = !hasQ;
  if (!hasQ) document.querySelector("[name=pay][value=transfer]").checked = true;
  renderPay();
}
/* Kotak bayar di layar setelah pesan: jumlah tepat (dengan kode unik) dan tujuan transfer */
function renderPay(){
  const need = (payVisible && (!placedProof || placedRejected)) || (placedClaimed && !placedProof);
  $("d-proofwrap").hidden = !need; $("d-proofok").hidden = !((payVisible || placedClaimed) && placedProof && !placedRejected);
  $("d-up-t").textContent = placedRejected ? "Unggah ulang bukti" : "Unggah bukti bayar";
  $("cancel-order").hidden = !(payVisible && !placedProof); if ($("cancel-order").hidden) resetCancel();
  renderTtl();
  const box = $("d-pay"); box.hidden = !payVisible; if (!payVisible) return;
  $("d-amt").textContent = rp(placedPay.total + placedPay.kode);
  const k = $("d-kode"); k.hidden = !placedPay.kode; k.textContent = placedPay.kode ? "Termasuk kode unik " + rp(placedPay.kode) + " agar pembayaranmu mudah dicek." : "";
  const q = placedPay.method === "qris" && !!settings.qrisUrl;
  $("d-bank").hidden = q; $("d-qris").hidden = !q;
  $("d-bank-name").textContent = settings.bankName; $("d-bank-holder").textContent = settings.bankHolder; $("d-bank-no").textContent = settings.bankNumber;
  $("qris-box").innerHTML = q ? `<img src="${esc(settings.qrisUrl)}" alt="QRIS Lapo Doli">` : "";
}
/* bagikan ke teman: lembar bagikan bawaan HP, atau WhatsApp kalau tidak ada */
const shareUrl = () => location.origin + "/";
const shareText = "Pre-order Lapo Doli: masakan Batak rumahan, PO tiap minggu, antar khusus Jakarta.";
async function shareToFriend(){
  const url = shareUrl(); track("bagikan");
  if (navigator.share) { try { await navigator.share({ title:"Lapo Doli", text:shareText, url }); } catch (e) { /* ditutup pembeli */ } return; }
  window.open(`https://wa.me/?text=${encodeURIComponent(shareText + " " + url)}`, "_blank", "noopener");
}
document.addEventListener("click", e => { if (e.target.closest("[data-share]")) shareToFriend(); });
async function copyText(text, el, okMsg){
  try { await navigator.clipboard.writeText(text); toast(okMsg); return; } catch (e) {}
  try { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); if (document.execCommand && document.execCommand("copy")) { toast(okMsg); return; } } catch (e) {}
  toast("Tekan lama angkanya untuk menyalin");
}
$("d-file").onchange = async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  const gid = placed[0] && placed[0].gid; if (!gid || !sb) { toast("Bukti belum bisa diunggah. Muat ulang halaman lalu coba lagi."); return; }
  if (!/^image\//.test(f.type)) { toast("Pilih foto atau tangkapan layar."); return; }
  const lab = $("d-up"), t = $("d-up-t"); lab.classList.add("busy"); t.textContent = "Mengirim...";
  try {
    const path = await api.uploadProof(gid, await shrink(f, 1400));
    if (!(await api.attachProof(gid, trackHp, path))) throw new Error("attach");
    placedProof = true; placed.forEach(o => { const c = trackConf[o.id] || (trackConf[o.id] = { payStatus:"cek", status:"baru" }); if (c.payStatus === "ditolak") c.payStatus = "cek"; c.proof = true; });
    if (lastData) { lastData.proof = true; lsSet(LS.last, lastData); }
    toast("Bukti terkirim"); renderTracker(); track("bukti_terkirim");
  } catch (err) { toast("Bukti belum terkirim. Periksa koneksi lalu coba lagi."); }
  finally { lab.classList.remove("busy"); t.textContent = placedRejected ? "Unggah ulang bukti" : "Unggah bukti bayar"; }
};
$("claim-btn").onclick = async () => {
  const b = $("claim-btn"), gid = placed[0] && placed[0].gid; if (!gid || !sb) return;
  b.disabled = true;
  try {
    const n = await api.claimPaid(gid, trackHp);
    if (n > 0) { placed.forEach(o => { const c = trackConf[o.id] || (trackConf[o.id] = { payStatus:"cek", status:"batal" }); c.claimed = true; }); toast("Admin sudah diberi tahu"); track("klaim_transfer"); renderTracker(); }
    else toast("Belum bisa dikirim. Hubungi admin lewat WhatsApp.");
  } catch (e) { toast("Belum terkirim. Periksa koneksi lalu coba lagi."); }
  b.disabled = false;
};
$("ttl-extend").onclick = async () => {
  const b = $("ttl-extend"), gid = placed[0] && placed[0].gid; if (!gid || !sb) return; b.disabled = true;
  try {
    const n = await api.extendPay(gid, trackHp);
    if (n > 0) { placedExtended = true; toast("Waktu bayar ditambah 30 menit"); track("perpanjang_waktu"); await pollTrack(); renderTtl(); }
    else toast("Waktu belum bisa ditambah. Hubungi admin lewat WhatsApp.");
  } catch (e) { toast("Belum berhasil. Periksa koneksi lalu coba lagi."); }
  b.disabled = false;
};
let cancelArmT = null;
function resetCancel(){ clearTimeout(cancelArmT); const b = $("cancel-order"); b.classList.remove("arm"); b.textContent = "Batalkan pesanan"; }
$("cancel-order").onclick = async () => {
  const b = $("cancel-order"), gid = placed[0] && placed[0].gid; if (!gid || !sb) return;
  if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Yakin batalkan pesanan?"; clearTimeout(cancelArmT); cancelArmT = setTimeout(resetCancel, 5000); return; }
  clearTimeout(cancelArmT); b.disabled = true; b.textContent = "Membatalkan...";
  try {
    const n = await api.cancelOrders(gid, trackHp);
    if (n > 0) {
      placed.forEach(o => { const c = trackConf[o.id] || (trackConf[o.id] = { payStatus:"cek", status:"baru" }); c.status = "batal"; });
      lsSet(LS.last, null); lastData = null; renderLast(); toast("Pesanan dibatalkan"); track("pesanan_dibatalkan");
      renderTracker();
    } else { toast("Pesanan ini sudah tidak bisa dibatalkan di sini. Hubungi admin."); pollTrack(); }
  } catch (err) { toast("Belum berhasil membatalkan. Periksa koneksi lalu coba lagi."); }
  finally { b.disabled = false; resetCancel(); }
};
$("copy-status").onclick = () => copyText(location.origin + "/?cek=" + placed.map(o => o.id).join(","), $("copy-status"), "Link status disalin");
$("copy-no").onclick = () => copyText(String(settings.bankNumber), $("d-bank-no"), "Nomor rekening disalin");
$("copy-amt").onclick = () => copyText(String(placedPay.total + placedPay.kode), $("d-amt"), "Jumlah disalin");

const areaFromText = t => { const m = /Jakarta\s+(Pusat|Utara|Barat|Selatan|Timur)/i.exec(t || ""); return m ? "Jakarta " + m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : ""; };
const val = {
  nama:   v => v.trim().length >= 2 ? "" : "Isi nama kamu.",
  hp:     v => /^(\+?62|0)8\d{7,12}$/.test(v.replace(/[\s-]/g, "")) ? "" : "Nomor HP tidak valid. Contoh: 08123456789",
  area:   v => AREAS.includes(v) ? "" : "Antar hanya untuk Jakarta. Cari alamatnya di atas, atau tulis kotanya, misalnya Jakarta Selatan.",
  alamat: v => v.trim().length >= 10 ? "" : "Alamat belum lengkap."
};

/* Nomor pesanan (tanggal PO + urutan, misalnya 1809-03) dibuat oleh server saat pesanan disimpan. */
function orderFailed(e){
  const m = String((e && e.message) || e), closed = /po_closed:(\d{4}-\d{2}-\d{2})/.exec(m);
  if (closed) {
    serverClosed.add(closed[1]);
    toast("PO " + dShort(closed[1]) + " sudah ditutup. Silakan pilih tanggal lain.");
    pruneClosed(); renderMenu(); if (qtyTotal()) renderCheckout(); else go(1);
    return;
  }
  const sold = /sold_out:([^:]+):(\d+)/.exec(m);
  if (sold) { toast("Porsi tidak cukup. Sisa " + sold[2] + " untuk menu ini. Kurangi jumlahnya lalu coba lagi."); refreshRemaining(); return; }
  if (/po_not_open/.test(m)) { toast("PO ini belum dibuka."); refreshPos(); return; }
  if (/menu_unavailable/.test(m)) { toast("Ada menu yang sudah habis. Muat ulang halaman lalu pilih lagi."); refreshProducts(); return; }
  if (/too_many_pending/.test(m)) { toast("Kamu masih punya 3 pesanan yang belum dibayar. Bayar atau batalkan dulu, lalu pesan lagi."); return; }
  if (/rate_limited/.test(m)) { toast("Terlalu banyak pesanan dari nomor ini dalam waktu singkat. Tunggu 10 menit lalu coba lagi."); return; }
  if (/invalid_hp/.test(m)) { toast("Nomor HP tidak valid."); return; }
  if (/invalid_(area|alamat)/.test(m)) { toast("Wilayah atau alamat belum benar."); return; }
  if (/invalid_nama/.test(m)) { toast("Nama belum benar."); return; }
  if (/po_not_found|option_required|invalid_(option|addon|qty|lines|groups|ref)|addon_exceeds_main|empty_group|duplicate_po/.test(m)) { toast("Isi pesanan tidak cocok dengan menu terbaru. Muat ulang halaman lalu pilih lagi."); refreshProducts(); refreshPos(); return; }
  toast("Pesanan belum terkirim. Periksa koneksi lalu coba lagi.");
}
const linePayload = i => ({ pid:i.pid, ...(i.addon ? { addon:i.addonId } : i.optIdx != null ? { opt:i.optIdx } : {}), qty:i.qty, note:i.note || "" });

let pendingRef = null, pendingSig = "";
const newRef = () => String(crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
async function submitOrder(){
  const gone = pruneClosed();
  if (gone.length) { toast("PO " + gone.join(", ") + " sudah ditutup dan dihapus dari pesananmu"); renderMenu(); if (qtyTotal()) renderCheckout(); else go(1); return; }
  let ok = true;
  const chk = (k, m) => { $("e-" + k).textContent = m; if (m) ok = false; };
  chk("nama", val.nama($("nama").value)); chk("hp", val.hp($("hp").value));
  if (isPick()) { chk("area", ""); chk("alamat", ""); } else { const at = areaFromText($("alamat").value); if (at) $("area").value = at; chk("alamat", val.alamat($("alamat").value)); if (!ok || !$("alamat").value.trim()) chk("area", ""); else chk("alamat", val.area($("area").value)); }
  if (!ok) { const f = [...document.querySelectorAll("#s2 .err")].find(x => x.textContent && !x.closest("[hidden]")); if (f) f.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
  if (!sb) { toast("Toko belum siap dipakai. Coba lagi nanti."); return; }
  const btn = $("paid"); btn.disabled = true; $("paid-t").textContent = "Memproses...";
  const method = document.querySelector("[name=pay]:checked").value, gs = groups();
  const customer = { nama:$("nama").value.trim(), hp:$("hp").value.trim(), fulfil, area:isPick() ? "" : $("area").value, alamat:isPick() ? "" : $("alamat").value.trim(), maps:isPick() ? "" : mapsUrl, notes:$("notes").value.trim(), method };
  const payload = { ...customer, groups:gs.map(g => ({ po_id:g.poId, lines:g.items.map(linePayload) })) }, sig = JSON.stringify(payload);
  /* kirim ulang isi yang sama (sinyal putus) memakai kunci yang sama, jadi server tidak membuat pesanan ganda */
  if (!pendingRef || sig !== pendingSig) { pendingRef = newRef(); pendingSig = sig; }
  let res;
  try { res = await api.createOrders({ ...payload, ref:pendingRef }); }
  catch (e) { btn.disabled = false; $("paid-t").textContent = "Pesan dan lanjut bayar"; orderFailed(e); return; }
  btn.disabled = false; $("paid-t").textContent = "Pesan dan lanjut bayar"; pendingRef = null;
  placed = res.map(r => ({ id:r.id, gid:r.gid, poId:r.po_id, poDate:r.po_date, fulfil:r.fulfil, hours:r.hours, pickupLoc:r.pickup_loc, total:r.total, items:r.items, ...customer }));
  recorded = true; trackHp = customer.hp;
  const outGs = res.map(r => ({ poId:r.po_id, date:r.po_date, fulfil:r.fulfil, items:r.items, ongkir:r.total - r.items.reduce((a, i) => a + i.price * i.qty, 0), total:r.total }));
  const kodeSum = res.reduce((a, r) => a + (Number(r.kode) || 0), 0), nums = placed.map(o => o.id).join(", ");
  placedPay = { total:grand(outGs), kode:kodeSum, method }; placedProof = false; placedAt = Date.now();
  if (grand(gs) !== grand(outGs)) toast("Harga menu berubah. Cek jumlah transfer di bawah.");
  $("sum3").innerHTML = summaryHTML(outGs, kodeSum);
  /* pesanan sudah tercatat: simpan isi keranjang untuk "pesan seperti sebelumnya", lalu kosongkan */
  lsSet(LS.snap, { cart:{ ...cart }, notes:{ ...itemNotes }, fulfil });
  track("pesan", { total:placedPay.total + kodeSum, tanggal:gs.length });
  for (const k in cart) delete cart[k]; for (const k in itemNotes) delete itemNotes[k]; $("notes").value = "";
  saveCart(); saveCust();
  lastData = { at:Date.now(), placed, outGs, pay:placedPay, proof:false }; lastRows = {}; lsSet(LS.last, lastData); renderLast();
  unsubTrack(); renderTracker(); startTrack();
  go(3);
}
$("paid").onclick = submitOrder;
["nama", "hp", "area", "alamat"].forEach(k => { $(k).addEventListener("input", () => { $("e-" + k).textContent = ""; }); });

/* ===== cari alamat lewat OpenStreetMap (Photon, gratis, tanpa kunci) ===== */
let gAbort = null, gTimer = null, gItems = [], gIdx = -1;
const PHOTON = "https://photon.komoot.io/api/", JKT_BBOX = "106.68,-6.40,107.00,-6.08";
const AREA_EN = { central:"Pusat", north:"Utara", west:"Barat", south:"Selatan", east:"Timur" };
const KEC = { Pusat:"gambir|sawah besar|kemayoran|senen|cempaka putih|menteng|tanah abang|johar baru", Utara:"penjaringan|pademangan|tanjung priok|koja|kelapa gading|cilincing",
  Barat:"cengkareng|grogol petamburan|taman sari|tambora|kebon jeruk|kalideres|palmerah|kembangan", Selatan:"tebet|setiabudi|setia budi|mampang prapatan|pasar minggu|kebayoran lama|cilandak|kebayoran baru|pancoran|jagakarsa|pesanggrahan",
  Timur:"matraman|pulogadung|pulo gadung|jatinegara|kramat jati|pasar rebo|cakung|duren sawit|makasar|ciracas|cipayung" };
function gAreaOf(pr){
  const t = [pr.county, pr.city, pr.district, pr.locality, pr.state, pr.name].filter(Boolean).join(" | ");
  let m = /Jakarta\s+(Pusat|Utara|Barat|Selatan|Timur)/i.exec(t); if (m) return "Jakarta " + m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  m = /(Central|North|West|South|East)\s+Jakarta/i.exec(t); if (m) return "Jakarta " + AREA_EN[m[1].toLowerCase()];
  const d = String(pr.district || "").toLowerCase().replace(/^(kecamatan|kec\.?)\s+/, "");
  for (const k in KEC) if (new RegExp("^(" + KEC[k] + ")$").test(d)) return "Jakarta " + k;
  return "";
}
function showAddrHint(on){ $("addr-hint").hidden = !on; }
function gClose(){ $("addr-list").hidden = true; $("addr-q").setAttribute("aria-expanded", "false"); $("addr-q").removeAttribute("aria-activedescendant"); gIdx = -1; }
function gRender(){
  const ul = $("addr-list");
  ul.innerHTML = gItems.map((s, i) => `<li role="option" id="addr-o${i}" data-i="${i}" aria-selected="${i === gIdx}"><b>${esc(s.main)}</b><small>${esc(s.sub)}</small></li>`).join("") + '<li class="gpow" aria-hidden="true">Data © OpenStreetMap</li>';
  ul.hidden = !gItems.length; $("addr-q").setAttribute("aria-expanded", String(!!gItems.length));
  if (gIdx >= 0) $("addr-q").setAttribute("aria-activedescendant", "addr-o" + gIdx);
}
const gUniq = arr => arr.filter((x, i) => x && arr.findIndex(y => String(y).toLowerCase() === String(x).toLowerCase()) === i);
function gParse(f){
  const p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [], area = gAreaOf(p);
  const reg = [p.state, p.county, p.city, p.district, p.locality].filter(Boolean).join(" ");
  /* kotak pencarian juga menyentuh Tangerang, Bekasi, Depok: tolak yang jelas di luar Jakarta */
  if (c.length < 2 || /tangerang|bekasi|depok|bogor|banten|jawa barat|west java/i.test(reg + " " + (p.county || ""))) return null;
  const st = [p.street, p.housenumber].filter(Boolean).join(" ");
  const main = p.name || st || p.district || "";
  const rest = gUniq([st, p.district || p.locality, area || "Jakarta", p.postcode]).filter(x => x !== main);
  if (!main) return null;
  return { main, sub:rest.join(", "), area, full:gUniq([main, ...rest]).join(", "), lat:Number(c[1]), lon:Number(c[0]) };
}
async function gSuggest(q){
  if (gAbort) gAbort.abort(); gAbort = new AbortController();
  const res = await fetch(PHOTON + "?limit=12&bbox=" + JKT_BBOX + "&q=" + encodeURIComponent(q), { signal:gAbort.signal });
  if (!res.ok) throw new Error("photon " + res.status);
  const j = await res.json(), seen = new Set(), raw = j.features || [];
  const out = raw.map(gParse).filter(x => x && !seen.has(x.full) && seen.add(x.full)).slice(0, 5);
  if (!out.length && window.console) console.warn("alamat: Photon memberi " + raw.length + " hasil, semuanya disaring", raw.slice(0, 3).map(f => f.properties));
  return out;
}
function gPick(i){
  const s = gItems[i]; if (!s) return; gClose();
  $("addr-q").value = s.main; $("e-addr-q").textContent = "";
  $("area").value = s.area || ""; $("alamat").value = s.full.slice(0, 300);
  mapsUrl = Number.isFinite(s.lat) && Number.isFinite(s.lon) ? `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}` : "";
  ["e-area", "e-alamat"].forEach(k => { $(k).textContent = ""; }); showAddrHint(true); saveCust(); track("alamat_peta");
  if (!s.area) { $("e-area").textContent = "Pilih wilayah Jakarta."; $("area").focus(); }
}
{
  $("addr-search").hidden = false;
  const q = $("addr-q");
  q.addEventListener("input", () => {
    mapsUrl = ""; showAddrHint(false); $("e-addr-q").textContent = ""; clearTimeout(gTimer);
    const v = q.value.trim(); if (v.length < 3) { gItems = []; gClose(); return; }
    gTimer = setTimeout(async () => { try { gItems = await gSuggest(v); gIdx = -1; gRender(); if (!gItems.length) $("e-addr-q").textContent = "Alamat tidak ditemukan di Jakarta. Isi alamat di bawah secara manual."; } catch (e) { if (e.name !== "AbortError") { gItems = []; gClose(); $("e-addr-q").textContent = "Pencarian alamat belum bisa dipakai. Isi alamat di bawah secara manual."; } } }, 400);
  });
  q.addEventListener("keydown", e => {
    if (e.key === "Escape") { gClose(); return; }
    if (!gItems.length || $("addr-list").hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); gIdx = (gIdx + 1) % gItems.length; gRender(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); gIdx = (gIdx - 1 + gItems.length) % gItems.length; gRender(); }
    else if (e.key === "Enter" && gIdx >= 0) { e.preventDefault(); gPick(gIdx); }
  });
  $("addr-list").addEventListener("pointerdown", e => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); gPick(Number(li.dataset.i)); } });
  q.addEventListener("focus", () => setTimeout(() => q.scrollIntoView({ block:"start", behavior:"smooth" }), 250));
  q.addEventListener("blur", () => setTimeout(gClose, 150));
}
/* Status pesanan di layar selesai diperbarui tiap 8 detik. */
let trackT = null, trackHp = "";
const unsubTrack = () => { clearInterval(trackT); trackT = null; trackConf = {}; };
async function pollTrack(){
  if (!placed.length || !sb) return;
  try { const rows = await api.trackOrders(placed.map(o => o.id), trackHp); rows.forEach(r => { trackConf[r.id] = { payStatus:r.pay_status, status:r.status, proof:!!r.has_proof, claimed:!!r.claimed, deadline:r.deadline || null, extended:!!r.extended }; }); Object.assign(lastRows, trackConf); renderLast(); renderTracker(); } catch (e) {}
}
function startTrack(){ pollTrack(); trackT = setInterval(() => { if (screen === 3 && !document.hidden) pollTrack(); }, 8000); }

const DLV = { baru:["Terkonfirmasi", "ok"], diproses:["Sedang diproses", "info"], diantar:["Dalam pengiriman", "info"], selesai:["Terkirim", "ok"] };
const DLV_PICK = { baru:["Terkonfirmasi", "ok"], diproses:["Sedang diproses", "info"], diantar:["Siap diambil", "info"], selesai:["Sudah diambil", "ok"] };
function statusLabel(o){
  if (o.status === "batal") return o.claimed ? ["Menunggu admin", "info"] : ["Dibatalkan", ""];
  if (o.payStatus === "ditolak") return ["Bayar ditolak", "bad"];
  if (o.payStatus !== "lunas") return o.proof ? ["Bukti dicek admin", "info"] : ["Menunggu bayar", "warn"];
  return (o.fulfil === "ambil" ? DLV_PICK : DLV)[o.status] || DLV.baru;
}
function renderTracker(){
  const tr = $("track");
  const cs = placed.map(o => trackConf[o.id] || { payStatus:"cek", status:"baru" });
  const allCancel = cs.length && cs.every(c => c.status === "batal"), anyNo = cs.some(c => c.payStatus === "ditolak");
  const allPaid = cs.every(c => c.payStatus === "lunas"), allDone = cs.every(c => c.status === "selesai" || c.status === "batal");
  const pk = placed[0] && placed[0].fulfil === "ambil", anyProof = placedProof || cs.some(c => c.proof), claimed = cs.some(c => c.claimed), canClaim = allCancel && !claimed && cs.every(c => c.payStatus !== "lunas");
  let title, sub, tone = "warn";
  if (!recorded) { title = "Pesanan dibuat"; sub = "Pesanan belum tercatat. Coba lagi."; }
  else if (allCancel && claimed) { title = "Menunggu admin"; sub = anyProof ? "Bukti diterima. Admin akan mencocokkan dan membuka lagi pesananmu." : "Permintaanmu sudah dikirim ke admin. Unggah bukti bayar supaya cepat dicek."; tone = "warn"; }
  else if (allCancel) { title = "Pesanan dibatalkan"; sub = canClaim ? "Pesanan yang belum dibayar dalam " + payWinText() + " dibatalkan otomatis. Kalau kamu sudah transfer, beri tahu admin." : "Hubungi admin lewat WhatsApp kalau ini keliru."; tone = "bad"; }
  else if (anyNo) { title = "Pembayaran belum cocok"; sub = "Pembayaran belum ditemukan. Unggah bukti yang jelas di bawah."; tone = "bad"; }
  else if (!allPaid && anyProof) { title = "Bukti diterima"; sub = "Admin sedang mengecek pembayaranmu. Statusnya berubah di sini."; }
  else if (!allPaid) { title = "Pesanan dicatat"; sub = "Transfer sesuai jumlah di bawah, lalu kirim bukti bayar."; }
  else if (allDone) { title = "Pesanan selesai"; sub = "Terima kasih, selamat makan!"; tone = "ok"; }
  else { title = "Pesanan terkonfirmasi"; sub = pk ? `Pembayaran diterima. Ambil di ${placed[0].pickupLoc || pickLoc()}, jam ${placed[0].hours || pickHours()}.` : `Pembayaran diterima. Diantar sesuai tanggal PO, jam ${hours()}.`; tone = "ok"; }
  { const dl = cs.map(c => c.deadline ? Date.parse(c.deadline) : 0).filter(Boolean); if (dl.length) placedDeadline = Math.max(...dl); placedExtended = cs.some(c => c.extended); }
  placedRejected = anyNo; placedClaimed = allCancel && claimed; placedProof = placedProof || cs.some(c => c.proof); $("claim-wrap").hidden = !canClaim; payVisible = !!recorded && !allPaid && !allCancel; renderPay();
  $("d-title").textContent = title; $("d-sub").textContent = sub; $("d-dot").className = "dot " + (tone === "warn" ? "" : tone);
  tr.innerHTML = placed.map((o, i) => {
    const c = cs[i], [lb, cl] = statusLabel({ fulfil:o.fulfil, payStatus:c.payStatus, status:c.status, proof:c.proof || placedProof });
    return `<li><div><b>${esc(o.id)}</b><small>${ic("po")}${esc(dShort(o.poDate))}${ic("clock")}${esc(o.hours || hours())}</small></div><span class="chip ${cl}">${lb}</span></li>`;
  }).join("");
}
$("again").onclick = () => {
  for (const k in cart) delete cart[k];
  for (const k in itemNotes) delete itemNotes[k];
  unsubTrack(); placed = []; payVisible = false; $("notes").value = ""; saveCart(); renderLast();
  renderMenu(); go(1);
};
/* ===== pesanan terakhir: kartu di beranda supaya pembeli bisa kembali ke info bayar dan status ===== */
let lastData = null, lastRows = {};
function renderLast(){
  const el = $("lastorder");
  if (!lastData) { el.hidden = true; syncQuick(); return; }
  const cs = lastData.placed.map(o => lastRows[o.id] || { payStatus:"cek", status:"baru" });
  const keep = cs.every(c => c.status === "batal") && cs.some(c => c.payStatus !== "lunas") && Date.now() - (lastData.at || 0) < 864e5;
  if (!keep && cs.every(c => c.status === "selesai" || c.status === "batal")) { lsSet(LS.last, null); lastData = null; el.hidden = true; syncQuick(); return; }
  const i = Math.max(0, cs.findIndex(c => c.payStatus !== "lunas")), [lb, cl] = statusLabel({ fulfil:lastData.placed[i].fulfil, payStatus:cs[i].payStatus, status:cs[i].status, proof:cs[i].proof || lastData.proof, claimed:cs[i].claimed });
  $("lc-id").textContent = lastData.placed.map(o => o.id).join(", ");
  $("lc-chip").className = "chip " + cl; $("lc-chip").textContent = lb; el.hidden = false; syncQuick();
}
async function pollLast(){
  if (!lastData || !sb) return;
  try { const rows = await api.trackOrders(lastData.placed.map(o => o.id), lastData.placed[0].hp); rows.forEach(r => { lastRows[r.id] = { payStatus:r.pay_status, status:r.status, proof:!!r.has_proof, claimed:!!r.claimed, deadline:r.deadline || null, extended:!!r.extended }; }); if (rows.some(r => r.has_proof) && !lastData.proof) { lastData.proof = true; lsSet(LS.last, lastData); } renderLast(); } catch (e) {}
}
$("lastorder").onclick = () => {
  if (!lastData) return;
  placed = lastData.placed; placedPay = lastData.pay || placedPay; placedProof = !!lastData.proof; placedAt = lastData.at || 0; recorded = true; trackHp = placed[0].hp;
  $("sum3").innerHTML = summaryHTML(lastData.outGs, placedPay.kode);
  unsubTrack(); renderTracker(); startTrack(); go(3);
};
function initLast(){
  const l = lsGet(LS.last);
  if (l && l.placed && l.placed.length && Date.now() - l.at < 14 * 864e5) { lastData = l; renderLast(); pollLast(); } else if (l) lsSet(LS.last, null);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollLast(); });
}

/* ================= ADMIN ================= */
const NEXT = { baru:"diproses", diproses:"diantar", diantar:"selesai" };
const nextLabel = o => (o.fulfil === "ambil" ? { baru:"Mulai proses", diproses:"Tandai siap diambil", diantar:"Tandai sudah diambil" } : { baru:"Mulai proses", diproses:"Tandai sudah dikirim", diantar:"Tandai sudah sampai" })[o.status];
const needsCheck = o => o.status !== "batal" && o.payStatus === "cek" && !!o.proofPath;
const isClaim = o => o.status === "batal" && !!o.claimedAt && o.payStatus === "cek" && !o.refund;
const payDue = o => Number(o.groupTotal || o.total) + orders.filter(x => x.gid === o.gid).reduce((t, x) => t + (x.kode || 0), 0);
const isLate = o => o.payStatus === "cek" && !o.proofPath && o.status !== "batal" && o.source !== "wa" && Date.now() > lateAt(o);
function statusChip(o){
  if (o.status === "batal") return isClaim(o) ? ["Klaim sudah transfer", "warn"] : o.refund === "perlu" ? ["Perlu refund", "bad"] : o.refund === "selesai" ? ["Sudah refund", ""] : ["Dibatalkan", ""];
  if (o.payStatus === "ditolak") return ["Bayar ditolak", "bad"];
  if (o.payStatus !== "lunas") return isLate(o) ? ["Lewat batas", "bad"] : o.proofPath ? ["Cek bukti", "warn"] : ["Belum bayar", "warn"];
  const pk = o.fulfil === "ambil";
  return ({ baru:["Siap diproses", "info"], diproses:["Sedang diproses", "info"], diantar:[pk ? "Siap diambil" : "Dalam pengiriman", "info"], selesai:[pk ? "Sudah diambil" : "Terkirim", "ok"] })[o.status] || ["Siap diproses", "info"];
}
function primaryAct(o){
  if (o.status === "batal") return o.refund === "perlu" ? ["refund_done", "Tandai sudah refund", ""] : ["reopen", armReopen === o.id ? "Tetap buka lagi" : "Buka lagi", "line"];
  if (o.payStatus !== "lunas") return ["pay_ok", "Konfirmasi bayar", ""];
  if (NEXT[o.status]) return ["next", nextLabel(o), ""];
  return null;
}
let orders = [], ordersState = "loading", filter = null, poFilter = "semua", tab = "orders";
const busy = new Set(), expanded = new Set(); let armCancel = null, armDel = null, armPoDel = null, armLate = false, armReopen = null;

/* ----- bunyi dan judul tab untuk pesanan baru ----- */
let seenInit = false, actx = null, lastCek = 0;
const sndOn = () => { try { return localStorage.getItem("ld_snd") !== "0"; } catch (e) { return true; } };
const ensureAudio = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {} };
document.addEventListener("pointerdown", ensureAudio, { capture:true, once:true });
function beep(){
  if (!sndOn() || !actx) return;
  try { const t = actx.currentTime; [660, 880].forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(), s = t + i * .15; o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.16, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .14); o.connect(g); g.connect(actx.destination); o.start(s); o.stop(s + .15); }); } catch (e) {}
}
function notifyChanges(prev, next){
  if (!seenInit) { seenInit = true; return; }
  const pm = new Map(prev.map(o => [o.id, o])), fresh = [], proofs = [];
  next.forEach(o => { const p = pm.get(o.id); if (!p) fresh.push(o); else if (!p.proofPath && o.proofPath) proofs.push(o); });
  if (!fresh.length && !proofs.length) return;
  const m = [];
  if (fresh.length) m.push(fresh.length === 1 ? "Pesanan baru " + fresh[0].id + " dari " + (fresh[0].nama || "pembeli") : fresh.length + " pesanan baru");
  if (proofs.length) m.push(proofs.length === 1 ? "Bukti bayar masuk " + proofs[0].id : proofs.length + " bukti bayar masuk");
  toast(m.join(". ")); beep();
}
function setOrders(rows){
  const prev = orders;
  orders = rows.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  ordersState = "ok";
  notifyChanges(prev, orders);
  renderAdmin();
}
const logAct = (action, target, detail = "") => { if (sb && isAdmin) api.logAct(action, String(target).slice(0, 200), String(detail).slice(0, 300)); };
const dg = s => String(s || "").replace(/\D/g, "").replace(/^(62|0)/, "");
const oMatch = (o, q) => { const n = q.trim().toLowerCase(); if (!n) return true; const d = dg(n); return o.id.toLowerCase().includes(n) || String(o.nama || "").toLowerCase().includes(n) || (d.length >= 3 && dg(o.hp).includes(d)); };
let oq = "", editing = null; const sel = new Set();
const ACT_MSG = { pay_ok:"Pembayaran dikonfirmasi", pay_no:"Ditandai tidak cocok", pay_undo:"Konfirmasi dibatalkan", next:"Status diperbarui", cancel:"Pesanan dibatalkan", reopen:"Pesanan dibuka lagi", refund_done:"Ditandai sudah dikembalikan" };
/* satu pintu untuk ubah status: tandai sibuk, simpan, catat, dan beri tombol Urungkan */
async function applyOrders(targets, patch, msg, act){
  const prev = targets.map(x => ({ id:x.id, pay_status:x.payStatus, status:x.status, refund:x.refund || "", claimed:x.claimedAt || null })), hasRefund = "refund" in patch, hasClaim = "claimed_at" in patch;
  targets.forEach(x => busy.add(x.id)); renderAdminOrders();
  try {
    await api.updateOrders(targets.map(x => x.id), patch); await refreshOrders(); logAct(act, targets.map(x => x.id).join(", "), JSON.stringify(patch));
    toastUndo(msg, async () => {
      const by = {}; prev.forEach(p => { const k = [p.pay_status, p.status, p.refund, p.claimed].join("|"); (by[k] = by[k] || []).push(p); });
      for (const k in by) { const f = by[k][0]; await api.updateOrders(by[k].map(p => p.id), { pay_status:f.pay_status, status:f.status, ...(hasRefund ? { refund:f.refund } : {}), ...(hasClaim ? { claimed_at:f.claimed } : {}) }); }
      logAct("urungkan", prev.map(p => p.id).join(", ")); await refreshOrders();
    });
  } catch (err) { toast("Belum tersimpan. Coba lagi."); }
  targets.forEach(x => busy.delete(x.id)); renderAdminOrders();
}
/* pesan WhatsApp siap kirim */
function waTemplates(o){
  const tgl = o.poDate ? dLong(o.poDate) : "", jam = o.hours || "", pk = o.fulfil === "ambil", gk = orders.filter(x => x.gid === o.gid).reduce((t, x) => t + (x.kode || 0), 0), nm = o.nama || "";
  const bayar = rp(Number(o.groupTotal || o.total) + gk), link = location.origin + "/?cek=" + o.id, T = [];
  if (o.status === "batal") return T;
  if (o.payStatus === "lunas") {
    T.push(["Konfirmasi", `Halo kak ${nm}, pembayaran pesanan ${o.id} sudah kami terima. ${pk ? "Pesanan siap diambil" : "Pesanan diantar"} ${tgl}, jam ${jam}. Terima kasih!`]);
    T.push([pk ? "Siap diambil" : "Sedang diantar", pk ? `Halo kak ${nm}, pesanan ${o.id} sudah siap diambil di ${o.pickupLoc || pickLoc()}, jam ${jam}.` : `Halo kak ${nm}, pesanan ${o.id} sedang diantar ke alamatmu. Mohon ditunggu ya.`]);
  } else {
    if (!o.proofPath) T.push(["Minta bukti", `Halo kak ${nm}, pesanan ${o.id} belum ada bukti bayar. Transfer ${bayar} lalu unggah buktinya di ${link}. Terima kasih!`]);
    T.push(["Batalkan", `Halo kak ${nm}, pesanan ${o.id} kami batalkan karena belum ada pembayaran. Kalau masih mau, silakan pesan lagi ya.`]);
  }
  return T;
}
/* nota cetak per pesanan */
function printNota(o){
  const gk = orders.filter(x => x.gid === o.gid).reduce((t, x) => t + (x.kode || 0), 0), pk = o.fulfil === "ambil";
  $("print-area").innerHTML = `<div class="nota"><h2>Lapo Doli</h2><p class="nid">${esc(o.id)}</p><p>${o.poDate ? esc(dLong(o.poDate)) : ""}${o.hours ? ", " + esc(o.hours) : ""}</p>
    <p><b>${esc(o.nama)}</b><br>${esc(o.hp)}<br>${pk ? "Ambil sendiri: " + esc(o.pickupLoc || pickLoc()) : esc((o.area ? o.area + ", " : "") + o.alamat)}</p>
    <table>${o.items.map(i => `<tr><td>${Number(i.qty) || 0}×</td><td>${esc(i.name)}${i.option ? " (" + esc(i.option) + ")" : ""}${i.note ? "<br><small>" + esc(i.note) + "</small>" : ""}</td><td>${Number(i.price) ? rp((Number(i.price) || 0) * (Number(i.qty) || 0)) : "Gratis"}</td></tr>`).join("")}
    ${o.ongkir ? `<tr><td></td><td>Ongkir</td><td>${rp(o.ongkir)}</td></tr>` : ""}<tr class="tot"><td></td><td>Total</td><td>${rp(o.total)}</td></tr></table>
    ${o.notes ? `<p>Catatan: ${esc(o.notes)}</p>` : ""}${gk ? `<p>Transfer tepat ${rp(Number(o.groupTotal) + gk)} (kode unik ${rp(gk)})</p>` : ""}<p>${o.payStatus === "lunas" ? "LUNAS" : "Belum lunas"}</p></div>`;
  document.body.classList.add("print-nota");
  const done = () => { document.body.classList.remove("print-nota"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done); window.print();
}
const FILTERS = [
  ["bukti", "Bukti masuk", o => needsCheck(o) || isClaim(o)],
  ["belum", "Belum bayar", o => o.payStatus === "cek" && o.status !== "batal" && !o.proofPath],
  ["siap", "Proses", o => o.payStatus === "lunas" && (o.status === "baru" || o.status === "diproses")],
  ["kirim", "Kirim", o => o.payStatus === "lunas" && o.status === "diantar"],
  ["selesai", "Selesai", o => o.status === "selesai"],
  ["batal", "Batal", o => (o.status === "batal" && !isClaim(o)) || o.payStatus === "ditolak"],
  ["semua", "Semua", () => true]
];
const EMPTY = { bukti:"Tidak ada bukti bayar yang menunggu dicek.", belum:"Tidak ada pesanan yang menunggu pembayaran.", siap:"Tidak ada pesanan yang menunggu diproses.", kirim:"Tidak ada pesanan yang sedang dikirim atau siap diambil.", selesai:"Belum ada pesanan selesai.", batal:"Tidak ada pesanan batal atau ditolak.", semua:"Belum ada pesanan. Pesanan baru muncul di sini otomatis." };
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? "" : new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(d); };

function orderRow(o){
  const [sl, sc] = statusChip(o), pa = primaryAct(o), open = expanded.has(o.id);
  const dis = busy.has(o.id) ? "disabled" : "", grp = Number(o.groupCount) > 1, pk = o.fulfil === "ambil";
  const wa = `https://wa.me/${normPhone(o.hp)}?text=${encodeURIComponent(`Halo kak ${o.nama || ""}, soal pesanan ${o.id} dari Lapo Doli: `)}`;
  const main = o.items.filter(i => !i.addon), adds = o.items.filter(i => i.addon), hasNote = !!o.notes || o.items.some(i => i.note);
  const summary = main.map(i => `${Number(i.qty) || 0}× ${i.name}${i.option ? " (" + i.option + ")" : ""}`).join(" · ") + (adds.length ? ` · +${adds.reduce((a, i) => a + (Number(i.qty) || 0), 0)} tambahan` : "");
  const gk = orders.filter(x => x.gid === o.gid).reduce((t, x) => t + (x.kode || 0), 0);
  let sec = o.status === "batal" && o.refund === "perlu" ? `<button class="btn line sm" data-act="reopen" ${dis}>${ic("undo")}Buka lagi</button>` : "";
  if (o.status !== "batal") {
    if (o.payStatus === "cek") sec += `<button class="btn line sm" data-act="pay_no" ${dis}>${ic("xcircle")}Bayar tidak cocok</button>`;
    if (o.payStatus === "lunas" && (o.status === "baru" || o.status === "diproses")) sec += `<button class="btn line sm" data-act="pay_undo" ${dis}>${ic("undo")}Batalkan konfirmasi</button>`;
    if (o.status !== "selesai") sec += armCancel === o.id ? `<button class="btn danger sm cancel" data-act="cancel" ${dis}>Yakin batalkan?</button>` : `<button class="btn line sm cancel" data-act="arm_cancel" ${dis}>${ic("ban")}Batalkan pesanan</button>`;
  }
  return `<article class="orow ${needsCheck(o) || isClaim(o) ? "attn" : ""} ${isLate(o) ? "late" : ""} ${open ? "open" : ""}" data-oid="${esc(o.id)}">
    <div class="orow-h">
      <span class="num">${esc(o.id)}</span>
      <div class="who"><div class="o1"><span class="oname">${esc(o.nama || "Tanpa nama")}</span>${o.proofPath ? `<button class="proofchip" data-proofrow type="button" aria-label="Lihat bukti ${esc(o.id)}">${ic("image")}Bukti</button>` : ""}${o.source === "wa" ? '<span class="otag">WA</span>' : ""}</div><div class="o3">${esc(summary)}</div></div>
      <span class="how">${pk ? "Ambil sendiri" : "Antar" + (o.area ? ", " + esc(o.area) : "")}${grp ? ", gabungan " + o.groupCount + " tanggal" : ""}</span>
      <span class="amt">${(o.payStatus === "cek" && o.status !== "batal") || isClaim(o) ? `<b>${rp(payDue(o))}</b><small>${Number(o.groupCount) > 1 ? "transfer gabungan" : "transfer"}</small>` : o.status === "batal" && o.refund === "perlu" ? `<b>${rp(payDue(o))}</b><small>kembalikan</small>` : rp(o.total)}</span>
      <span class="chip st ${sc}">${sl}</span>
      <div class="oside">${bulkKey(o) ? `<label class="selbox"><input type="checkbox" data-sel aria-label="Pilih ${esc(o.id)}" ${sel.has(o.id) ? "checked" : ""}></label>` : ""}${pa ? `<button class="btn sm ${pa[2]}" data-act="${pa[0]}" ${dis}>${pa[1]}</button>` : ""}<button class="btn line sm iconbtn" data-toggle aria-expanded="${open}" aria-label="${open ? "Tutup detail" : "Buka detail"}" title="${open ? "Tutup detail" : "Buka detail"}">${ic("chevron", open ? "flip" : "")}</button></div>
    </div>
    ${open && editing === o.id ? editHTML(o) : ""}
    ${open && editing !== o.id ? `<div class="odetail">
      <ul class="ofacts">
        <li>${ic("chat")}<a href="${esc(wa)}" target="_blank" rel="noopener">${esc(o.hp)}</a></li>
        <li>${ic("pin")}<span>${pk ? esc(o.pickupLoc || pickLoc()) : esc((o.area ? o.area + ", " : "") + (o.alamat || "-"))}</span>${pk ? "" : `<a class="maplink" href="${esc(o.mapsUrl || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(((o.alamat || "") + " " + (o.area || "")).trim()))}" target="_blank" rel="noopener">${o.mapsUrl ? "Buka peta" : "Cari di peta"}</a>`}</li>
        <li>${ic("clock")}<span>${o.poDate ? esc(dShort(o.poDate)) : "-"}${o.hours ? ", " + esc(o.hours) : ""}</span></li>
        <li>${ic("receipt")}<span>Dipesan ${fmtTime(o.createdAt)}, ${o.method === "qris" ? "QRIS" : "transfer"}</span></li>
      </ul>
      <div class="oitems">
        <ul class="itl">${o.items.map(i => `<li><span class="q">${Number(i.qty) || 0}×</span><span class="n">${esc(i.name)}${i.option ? " (" + esc(i.option) + ")" : ""}</span><span class="p">${Number(i.price) ? rp((Number(i.price) || 0) * (Number(i.qty) || 0)) : "Gratis"}</span></li>${i.note ? `<li class="inl">${esc(i.note)}</li>` : ""}`).join("")}${o.ongkir ? `<li><span class="q"></span><span class="n">Ongkir</span><span class="p">${rp(o.ongkir)}</span></li>` : ""}</ul>
        <div class="ototal"><span>Total</span><span>${rp(o.total)}</span></div>
      </div>
      ${o.notes ? `<p class="onote full">${esc(o.notes)}</p>` : ""}
      ${o.refund === "perlu" ? `<p class="onote full warn">Pesanan lunas dibatalkan. Kembalikan ${rp(payDue(o))} ke ${esc(o.nama)} (${esc(o.hp)}), lalu tekan Tandai sudah refund.</p>` : ""}
      ${isClaim(o) ? `<p class="onote full warn">Pembeli mengaku sudah transfer setelah pesanan dibatalkan otomatis. Cek mutasi dan bukti, lalu Buka lagi dan Konfirmasi bayar.</p>` : ""}
      ${gk ? `<p class="onote full">Transfer tepat ${rp(Number(o.groupTotal) + gk)} (kode unik ${rp(gk)}).</p>` : ""}
      ${grp ? `<p class="onote full">Bayar gabungan ${o.groupCount} tanggal, total ${rp(o.groupTotal)}. Konfirmasi berlaku untuk semuanya.</p>` : ""}
      <div class="acts full"><button class="btn line sm" data-edit type="button">${ic("edit")}Ubah</button><button class="btn line sm" data-nota type="button">${ic("print")}Cetak nota</button>${sec}</div>
      ${waTemplates(o).length ? `<div class="wachips full" aria-label="Pesan WhatsApp siap kirim"><span>Kirim pesan</span>${waTemplates(o).map(([l, t]) => `<a class="wachip" href="https://wa.me/${normPhone(o.hp)}?text=${encodeURIComponent(t)}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div>` : ""}
    </div>` : ""}</article>`;
}
function editHTML(o){
  const pk = o.fulfil === "ambil", one = Number(o.groupCount) <= 1;
  return `<div class="odetail editbox" data-editbox>
    <div class="full eh"><b>Ubah pesanan ${esc(o.id)}</b></div>
    ${o.payStatus === "lunas" ? `<p class="onote full warn">Pesanan ini sudah lunas. Mengubah jumlah mengubah total, tapi pembayaran pembeli tidak ikut berubah. Hitung selisihnya dan hubungi pembeli.</p>` : ""}
    <label class="ef">Nama<input data-ef="nama" value="${esc(o.nama)}"></label>
    <label class="ef">No. HP<input data-ef="hp" value="${esc(o.hp)}" inputmode="tel"></label>
    ${pk ? "" : `
    <label class="ef full">Alamat<textarea data-ef="alamat">${esc(o.alamat)}</textarea></label>`}
    <label class="ef full">Catatan<textarea data-ef="notes">${esc(o.notes)}</textarea></label>
    ${one ? `<div class="full eq"><span>Jumlah</span>${o.items.map((i, k) => `<label class="eqrow"><span>${esc(i.name)}${i.option && !i.addon ? " (" + esc(i.option) + ")" : ""}${i.addon ? " (tambahan)" : ""}</span><input type="number" min="0" max="99" data-eq="${k}" value="${Number(i.qty) || 0}" aria-label="Jumlah ${esc(i.name)}"></label>`).join("")}<small>Total dihitung ulang. Jumlah 0 menghapus baris.</small></div>` : `<p class="onote full">Pesanan gabungan: jumlah item tidak bisa diubah di sini. Batalkan lalu buat ulang kalau perlu.</p>`}
    <div class="acts full"><button class="btn sm" data-editsave type="button">Simpan</button><button class="btn line sm" data-editcancel type="button">Batal</button></div>
  </div>`;
}
async function saveEdit(o, box){
  const g = k => { const e = box.querySelector(`[data-ef="${k}"]`); return e ? e.value.trim() : ""; }, pk = o.fulfil === "ambil";
  const err = val.nama(g("nama")) || val.hp(g("hp")) || (pk ? "" : val.alamat(g("alamat")));
  if (err) { toast(err); return; }
  const patch = { nama:g("nama"), hp:g("hp"), notes:g("notes") };
  if (!pk) { patch.alamat = g("alamat"); patch.area = areaFromText(patch.alamat) || o.area; if (patch.alamat !== o.alamat) patch.maps_url = ""; }
  const qs = [...box.querySelectorAll("[data-eq]")].map(i => Math.max(0, Math.min(99, parseInt(i.value, 10) || 0))), qChanged = qs.length && qs.some((q, k) => q !== (Number(o.items[k].qty) || 0));
  busy.add(o.id); renderAdminOrders();
  try {
    if (qChanged) await api.editItems(o.id, qs);
    await api.updateOrders([o.id], patch); await refreshOrders(); logAct("ubah_pesanan", o.id, JSON.stringify({ ...patch, jumlah:qChanged ? qs : undefined }));
    editing = null; toast(o.payStatus === "lunas" && qChanged ? "Tersimpan. Total berubah, hubungi pembeli soal selisih." : "Perubahan disimpan");
  } catch (e) {
    const m = String(e && e.message || "");
    toast(/empty_order/.test(m) ? "Minimal satu menu utama harus ada." : /addon_exceeds/.test(m) ? "Tambahan tidak boleh melebihi menu utama." : /group_order/.test(m) ? "Pesanan gabungan tidak bisa diubah jumlahnya." : /not_admin|forbidden/.test(m) ? "Belum diizinkan. Jalankan ulang schema.sql terbaru." : "Belum tersimpan. Coba lagi.");
  }
  busy.delete(o.id); renderAdminOrders();
}
/* tindakan utama yang bisa dilakukan sekaligus: konfirmasi bayar, atau pindah ke status berikutnya */
const bulkKey = o => { const pa = primaryAct(o); return !pa ? "" : pa[0] === "pay_ok" ? "pay_ok" : pa[0] === "next" ? "next:" + NEXT[o.status] : ""; };
function selBar(){
  const groups = {};
  [...sel].forEach(id => { const o = orders.find(x => x.id === id), k = o && bulkKey(o); if (!k) { sel.delete(id); return; } (groups[k] = groups[k] || []).push(o); });
  const keys = Object.keys(groups); if (!keys.length) return "";
  return `<div class="selbar" role="region" aria-label="Pilihan"><b>${sel.size} dipilih</b><span class="sp"></span>${keys.map(k => `<button class="btn sm" data-bulk="${k}" type="button">${ic("check")}${k === "pay_ok" ? "Konfirmasi bayar" : esc(nextLabel(groups[k][0]))} (${groups[k].length})</button>`).join("")}<button class="btn line sm" data-bulk="clear" type="button">Batal pilih</button></div>`;
}
const quotaOf = (poId, pid) => { const po = (pos || []).find(p => p.id === poId), pr = (products || []).find(p => p.id === pid), q = po && po.quotas && po.quotas[pid] != null && po.quotas[pid] !== "" ? Number(po.quotas[pid]) : (pr && pr.quota != null ? Number(pr.quota) : null); return q == null || isNaN(q) ? null : q; };
const soldOf = (poId, pid, skip) => orders.filter(x => x.poId === poId && x.id !== skip && x.status !== "batal" && x.payStatus !== "ditolak" && !(x.payStatus === "cek" && !x.proofPath && Date.now() > lateAt(x)))
  .reduce((t, x) => t + x.items.filter(i => i.pid === pid && !i.addon).reduce((s, i) => s + (Number(i.qty) || 0), 0), 0);
function reopenWarn(o){
  const need = {}; o.items.filter(i => !i.addon).forEach(i => { need[i.pid] = (need[i.pid] || 0) + (Number(i.qty) || 0); });
  for (const pid in need) { const q = quotaOf(o.poId, pid); if (q == null) continue; const sold = soldOf(o.poId, pid, o.id); if (sold + need[pid] > q) { const nm = (o.items.find(i => i.pid === pid) || {}).name || pid; return nm + " sisa " + Math.max(0, q - sold) + ", pesanan ini " + need[pid]; } }
  return "";
}
const lateOrders = () => orders.filter(o => (poFilter === "semua" || o.poId === poFilter) && isLate(o));
function lateBar(base, cur){
  const n = base.filter(isLate).length; if (!n || (cur !== "belum" && cur !== "semua")) return "";
  return `<div class="latebar">${ic("clock")}<span>${n} pesanan lewat batas bayar ${payWinText()} dan porsinya tidak ditahan.</span><button class="btn sm ${armLate ? "danger" : "line"}" data-late type="button">${armLate ? "Yakin batalkan " + n + "?" : "Batalkan " + n}</button></div>`;
}
function renderAdminOrders(){
  const el = $("a-orders");
  if (ordersState === "loading") { el.innerHTML = '<p class="note">Memuat pesanan...</p>'; return; }
  const cekAll = orders.filter(FILTERS[0][2]).length;
  if (newOpen) { setCek(cekAll); return; }
  if (poFilter !== "semua" && !(pos || []).some(p => p.id === poFilter)) poFilter = "semua";
  const base = orders.filter(o => (poFilter === "semua" || o.poId === poFilter) && oMatch(o, oq));
  const cnt = k => base.filter(FILTERS.find(f => f[0] === k)[2]).length;
  if (filter === null && orders.length) filter = ["bukti", "belum", "siap", "kirim"].find(k => cnt(k) > 0) || "semua";
  const cur = oq.trim() ? "semua" : (filter || "semua"), f = FILTERS.find(x => x[0] === cur) || FILTERS[6];
  const list = base.filter(f[2]); shownList = list;
  const poOpts = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byPo = {}; list.forEach(o => { const k = o.poDate || "-"; (byPo[k] = byPo[k] || []).push(o); });
  const dates = Object.keys(byPo).sort((a, b) => a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b));
  el.innerHTML = `
    <div class="toolbar">
      <div class="stabs" role="group" aria-label="Filter status">${FILTERS.map(x => { const n = cnt(x[0]); return `<button type="button" data-filter="${x[0]}" aria-pressed="${x[0] === cur}">${x[1]}<span class="c ${(x[0] === "bukti" && n) || (x[0] === "batal" && base.some(o => o.refund === "perlu")) ? "hot" : ""}">${n}</span></button>`; }).join("")}</div>
      <label class="osearch">${ic("search")}<input id="o-q" type="search" placeholder="Cari nomor, nama, atau HP" value="${esc(oq)}" aria-label="Cari pesanan" autocomplete="off"></label>
      <button class="btn line sm iconbtn" data-snd type="button" aria-pressed="${sndOn()}" aria-label="Bunyi pesanan baru" title="${sndOn() ? "Bunyi aktif" : "Bunyi mati"}">${ic(sndOn() ? "bell" : "bell-off")}</button>
      <select id="f-po" class="sel" aria-label="Filter tanggal PO"><option value="semua">Semua tanggal</option>${poOpts.map(p => `<option value="${esc(p.id)}" ${p.id === poFilter ? "selected" : ""}>${esc(dShort(p.date))}</option>`).join("")}</select>
      <button class="btn sm add" data-newopen type="button">${ic("plus")}Pesanan</button>
    </div>
    ${selBar()}
    ${lateBar(base, cur)}
    ${dates.length ? dates.map(d => { const os = byPo[d], por = os.reduce((a, o) => a + o.items.filter(i => !i.addon).reduce((s, i) => s + (Number(i.qty) || 0), 0), 0);
      const sum = os.filter(o => o.status !== "batal" && o.payStatus !== "ditolak").reduce((t, o) => t + o.total, 0);
      const sids = os.filter(bulkKey).map(o => o.id);
      return `<div class="group"><span>${d === "-" ? "Tanggal PO tidak tercatat" : esc(dLong(d))}${sids.length > 1 ? ` <button class="linkbtn selall" data-selall="${esc(sids.join(","))}" type="button">Pilih semua</button>` : ""}</span><span>${os.length} pesanan, ${por} porsi, <b>${rp(sum)}</b></span></div><div class="olist">${os.map(orderRow).join("")}</div>`; }).join("")
      : `<div class="empty" style="margin-top:16px">${EMPTY[cur] || EMPTY.semua}</div>`}`;
  setCek(cekAll);
}
$("a-orders").addEventListener("change", e => { if (e.target.id === "f-po") { poFilter = e.target.value; renderAdminOrders(); } });
let shownList = [];
async function openProofViewer(startId){
  const ids = shownList.filter(o => o.proofPath).map(o => o.id); if (!ids.includes(startId)) ids.unshift(startId);
  let i = ids.indexOf(startId), seq = 0;
  const box = document.createElement("div"); box.className = "lightbox pv"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Bukti bayar");
  box.innerHTML = `<div class="pv-bar"><div class="pv-who"><b id="pv-t"></b><span id="pv-s"></span></div><span class="pv-n" id="pv-n"></span><button type="button" class="lb-x" aria-label="Tutup">${ic("x")}</button></div>
    <div class="pv-stage"><button type="button" class="pv-nav" data-pv="-1" aria-label="Bukti sebelumnya">${ic("up")}</button><div class="pv-img" id="pv-img"></div><button type="button" class="pv-nav" data-pv="1" aria-label="Bukti berikutnya">${ic("down")}</button></div>
    <div class="pv-act" id="pv-act"></div>`;
  const cur = () => orders.find(o => o.id === ids[i]);
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = ev => { if (ev.key === "Escape") close(); else if (ev.key === "ArrowRight" || ev.key === "ArrowDown") go(1); else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") go(-1); };
  async function show(){
    const o = cur(); if (!o) { close(); return; } const my = ++seq;
    box.querySelector("#pv-t").textContent = o.id + " " + (o.nama || ""); box.querySelector("#pv-n").textContent = (i + 1) + " dari " + ids.length;
    box.querySelector("#pv-s").textContent = (o.payStatus === "lunas" ? "Lunas, " : o.status === "batal" ? "Dibatalkan, " : "Menunggu cek, ") + "transfer " + rp(payDue(o));
    const act = box.querySelector("#pv-act"), ok = o.status !== "batal" && o.payStatus === "cek";
    act.innerHTML = ok ? `<button class="btn" data-pvok type="button">${ic("check")}Konfirmasi bayar</button><button class="btn line" data-pvno type="button">${ic("xcircle")}Tidak cocok</button>` : `<span class="pv-note">${o.payStatus === "lunas" ? "Sudah dikonfirmasi" : "Tidak perlu dicek"}</span>`;
    act.insertAdjacentHTML("afterbegin", '<span class="pv-hint">Ketuk gambar untuk memperbesar</span>');
    const im = box.querySelector("#pv-img"); im.classList.remove("zoom"); im.innerHTML = '<p class="pv-load">Memuat bukti...</p>';
    try { const url = await api.proofUrl(o.proofPath); if (my === seq) im.innerHTML = `<img src="${esc(url)}" alt="Foto bukti bayar ${esc(o.id)}">`; }
    catch (e) { if (my === seq) im.innerHTML = '<p class="pv-load">Bukti belum bisa dibuka. Coba lagi.</p>'; }
  }
  const go = d => { const n = i + d; if (n < 0 || n >= ids.length) return; i = n; show(); };
  box.addEventListener("click", async ev => {
    if (ev.target === box || ev.target.closest(".lb-x")) { close(); return; }
    const nv = ev.target.closest("[data-pv]"); if (nv) { go(Number(nv.dataset.pv)); return; }
    if (ev.target.closest("#pv-img img")) { box.querySelector("#pv-img").classList.toggle("zoom"); return; }
    const o = cur(); if (!o) return;
    const ts = (o.gid ? orders.filter(x => x.gid === o.gid) : [o]).filter(x => x.status !== "batal");
    if (ev.target.closest("[data-pvok]")) { await applyOrders(ts, { pay_status:"lunas" }, ACT_MSG.pay_ok, "pay_ok"); if (i < ids.length - 1) go(1); else show(); }
    else if (ev.target.closest("[data-pvno]")) { await applyOrders(ts, { pay_status:"ditolak" }, ACT_MSG.pay_no, "pay_no"); if (i < ids.length - 1) go(1); else show(); }
  });
  document.addEventListener("keydown", onKey); document.body.appendChild(box); box.querySelector(".lb-x").focus(); show();
}
function openLightbox(url){
  const box = document.createElement("div"); box.className = "lightbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Bukti bayar");
  box.innerHTML = `<button type="button" class="lb-x" aria-label="Tutup">${ic("x")}</button><img src="${esc(url)}" alt="Foto bukti bayar">`;
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); }, onKey = ev => { if (ev.key === "Escape") close(); };
  box.addEventListener("click", ev => { if (ev.target === box || ev.target.closest(".lb-x")) close(); });
  document.addEventListener("keydown", onKey); document.body.appendChild(box); box.querySelector(".lb-x").focus();
}
$("a-orders").addEventListener("click", async e => {
  const pb = e.target.closest("[data-proof]");
  if (pb) { const r0 = pb.closest("[data-oid]"); if (r0) openProofViewer(r0.dataset.oid); return; }
  const pr = e.target.closest("[data-proofrow]"); if (pr) { openProofViewer(pr.closest("[data-oid]").dataset.oid); return; }
  if (e.target.closest("[data-newopen]")) { openNew(); return; }
  const fb = e.target.closest("[data-filter]");
  if (fb) { filter = fb.dataset.filter; armCancel = null; armLate = false; renderAdminOrders(); return; }
  const sa = e.target.closest("[data-selall]");
  if (sa) { sa.dataset.selall.split(",").forEach(id => sel.add(id)); renderAdminOrders(); return; }
  const bk = e.target.closest("[data-bulk]");
  if (bk) {
    if (bk.dataset.bulk === "clear") { sel.clear(); renderAdminOrders(); return; }
    const key = bk.dataset.bulk, sels = [...sel].map(id => orders.find(x => x.id === id)).filter(o => o && bulkKey(o) === key);
    sels.forEach(o => sel.delete(o.id));
    if (!sels.length) { renderAdminOrders(); return; }
    if (key === "pay_ok") {
      const ids = new Set(); sels.forEach(o => (o.gid ? orders.filter(x => x.gid === o.gid) : [o]).filter(x => x.status !== "batal").forEach(x => ids.add(x.id)));
      const ts = orders.filter(x => ids.has(x.id)); await applyOrders(ts, { pay_status:"lunas" }, ts.length + " pesanan dikonfirmasi", "konfirmasi_massal");
    } else await applyOrders(sels, { status:key.slice(5) }, sels.length + " pesanan diperbarui", "status_massal");
    return;
  }
  if (e.target.closest("[data-snd]")) { try { localStorage.setItem("ld_snd", sndOn() ? "0" : "1"); } catch (er) {} ensureAudio(); if (sndOn()) beep(); renderAdminOrders(); return; }
  if (e.target.closest("[data-late]")) {
    const ls = lateOrders(); if (!ls.length) { armLate = false; renderAdminOrders(); return; }
    if (!armLate) { armLate = true; renderAdminOrders(); return; }
    armLate = false; await applyOrders(ls, { status:"batal" }, ls.length + " pesanan dibatalkan", "batal_lewat_batas"); return;
  }
  const row = e.target.closest("[data-oid]");
  if (e.target.closest("[data-toggle]") && row) { const id = row.dataset.oid; if (expanded.has(id)) { expanded.delete(id); armCancel = null; } else expanded.add(id); renderAdminOrders(); return; }
  if (row && e.target.closest("[data-edit]")) { editing = row.dataset.oid; renderAdminOrders(); return; }
  if (row && e.target.closest("[data-editcancel]")) { editing = null; renderAdminOrders(); return; }
  if (row && e.target.closest("[data-editsave]")) { const o = orders.find(x => x.id === row.dataset.oid); if (o && !busy.has(o.id)) await saveEdit(o, row.querySelector("[data-editbox]")); return; }
  if (row && e.target.closest("[data-nota]")) { const o = orders.find(x => x.id === row.dataset.oid); if (o) printNota(o); return; }
  const b = e.target.closest("[data-act]"); if (!b || !row) return;
  const id = row.dataset.oid, act = b.dataset.act;
  const o = orders.find(x => x.id === id); if (!o || busy.has(id)) return;
  if (act === "arm_cancel") { armCancel = id; renderAdminOrders(); return; }
  /* pembayaran berlaku untuk seluruh pesanan satu checkout, kecuali yang sudah dibatalkan */
  const group = () => (o.gid ? orders.filter(x => x.gid === o.gid) : [o]).filter(x => x.status !== "batal");
  let targets = [o], patch;
  if (act === "pay_ok") { targets = group(); patch = { pay_status:"lunas" }; }
  else if (act === "pay_undo") { targets = group(); patch = { pay_status:"cek" }; }
  else if (act === "pay_no") { targets = group(); patch = { pay_status:"ditolak" }; }
  else if (act === "next") patch = { status:NEXT[o.status] };
  else if (act === "cancel") patch = o.payStatus === "lunas" ? { status:"batal", refund:"perlu" } : { status:"batal" };
  else if (act === "refund_done") patch = { refund:"selesai" };
  else if (act === "reopen") {
    const w = reopenWarn(o);
    if (w && armReopen !== id) { armReopen = id; toast("Kuota terlampaui: " + w + ". Ketuk lagi untuk tetap membuka."); renderAdminOrders(); return; }
    armReopen = null; patch = { status:"baru", pay_status:o.payStatus === "ditolak" ? "cek" : o.payStatus, ...(o.claimedAt ? { claimed_at:null } : {}), ...(o.refund === "perlu" ? { refund:"" } : {}) };
  }
  else return;
  armCancel = null; await applyOrders(targets, patch, ACT_MSG[act] || "Tersimpan", act);
});
$("a-orders").addEventListener("change", e => { const c = e.target.closest("[data-sel]"); if (!c) return; const r = c.closest("[data-oid]"); if (!r) return; if (c.checked) sel.add(r.dataset.oid); else sel.delete(r.dataset.oid); renderAdminOrders(); });
$("a-orders").addEventListener("input", e => {
  if (e.target.id !== "o-q") return;
  oq = e.target.value; const pos = e.target.selectionStart; renderAdminOrders();
  const i = $("o-q"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) {} }
});

/* --- pesanan manual (dari WhatsApp) --- */
let newOpen = false; const mcart = {};
const mMain = pid => Object.keys(mcart).filter(k => { const s = k.split("::"); return s[0] === pid && !(s[1] || "").startsWith("+"); }).reduce((a, k) => a + mcart[k], 0);
function mClamp(pid){ const m = mMain(pid); Object.keys(mcart).forEach(k => { const s = k.split("::"); if (s[0] === pid && (s[1] || "").startsWith("+") && mcart[k] > m) { if (m > 0) mcart[k] = m; else delete mcart[k]; } }); }
const mstep = (key, label) => `<div class="step" data-nk="${esc(key)}"><button type="button" data-nd="-1" aria-label="Kurangi ${esc(label)}">−</button><span data-q>0</span><button type="button" data-nd="1" aria-label="Tambah ${esc(label)}">+</button></div>`;
function mLines(){
  const list = products || [];
  return Object.keys(mcart).filter(k => mcart[k] > 0).map(k => {
    const [pid, idx] = k.split("::"), pi = list.findIndex(x => x.id === pid), p = list[pi]; if (!p) return null;
    if (idx === undefined) return { pid, name:p.name, option:"", addon:false, addonId:null, optIdx:null, price:Number(p.price) || 0, qty:mcart[k], ord:pi * 1000 };
    if (idx.startsWith("+")) { const ai = addonsOf(p).findIndex(x => x.id === idx.slice(1)); if (ai < 0) return null; const a = addonsOf(p)[ai];
      return { pid, name:a.name, option:"untuk " + p.name, addon:true, addonId:a.id, optIdx:null, price:Number(a.price) || 0, qty:mcart[k], ord:pi * 1000 + 500 + ai }; }
    const o = optsOf(p)[Number(idx)]; if (!o) return null;
    return { pid, name:p.name, option:o.name, addon:false, addonId:null, optIdx:Number(idx), price:o.price, qty:mcart[k], ord:pi * 1000 + Number(idx) };
  }).filter(Boolean).sort((a, b) => a.ord - b.ord);
}
function openNew(){
  newOpen = true; for (const k in mcart) delete mcart[k];
  $("a-orders").hidden = true; $("a-new").hidden = false; renderNewForm();
}
function closeNew(){ newOpen = false; $("a-new").hidden = true; $("a-orders").hidden = false; renderAdminOrders(); }
function renderNewForm(){
  const pl = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))), list = products || [];
  const def = (pl.find(poOpenNow) || pl[0] || {}).id;
  $("a-new").innerHTML = `<div class="nform">
    <div class="toolbar"><button class="btn line sm" data-nclose type="button">${ic("back")}Pesanan</button><b>Pesanan baru</b></div>
    <div class="grid2">
      <div><label class="lb" for="n-po" style="margin-top:0">Tanggal PO</label><select id="n-po">${pl.map(po => `<option value="${esc(po.id)}" ${po.id === def ? "selected" : ""}>${esc(dShort(po.date))}${poOpenNow(po) ? "" : " (ditutup)"}</option>`).join("")}</select></div>
      <div><label class="lb" style="margin-top:0">Cara terima</label><div class="opts opts-row" id="n-fulfil"><label class="opt"><input type="radio" name="nf" value="antar" checked><span class="opt-t"><b>Antar</b></span><i class="dot" aria-hidden="true"></i></label><label class="opt"><input type="radio" name="nf" value="ambil"><span class="opt-t"><b>Ambil sendiri</b></span><i class="dot" aria-hidden="true"></i></label></div></div>
    </div>
    <div class="grid2">
      <div><label class="lb" for="n-nama">Nama</label><input type="text" id="n-nama" placeholder="Nama lengkap"><div class="err" id="n-e-nama"></div></div>
      <div><label class="lb" for="n-hp">No. HP</label><input type="tel" id="n-hp" inputmode="tel" placeholder="08123456789"><div class="err" id="n-e-hp"></div></div>
    </div>
    <div id="n-addr">
      <label class="lb" for="n-alamat">Alamat lengkap</label><textarea id="n-alamat" placeholder="Jalan, nomor rumah, patokan"></textarea><div class="err" id="n-e-alamat"></div>
    </div>
    <label class="lb" for="n-notes">Catatan</label><textarea id="n-notes" placeholder="Contoh: tidak pakai cabai"></textarea>
    <div class="label">Menu</div>
    ${list.map(p => { const opts = optsOf(p), adds = addonsOf(p);
      return `<div class="nitem"><div class="nrow"><div><b>${esc(p.name)}</b> <small>${optsOf(p).some(o => o.custom) ? "mulai " + rp(fromPrice(p)) : rp(p.price)}${p.available === false ? " · habis" : ""}</small></div>${opts.length ? "" : mstep(p.id, p.name)}</div>
        ${opts.length ? `<div class="vpanel" style="display:block">${variantsHTML(p, p.id, mstep)}</div>` : ""}
        ${adds.length ? `<div class="subs"><div class="subs-title">Tambahan</div>${adds.map(a => `<div class="sub"><span>${esc(a.name)}<em>${a.price ? "+" + rp(a.price) : "gratis"}</em></span>${mstep(p.id + "::+" + a.id, a.name + " untuk " + p.name)}</div>`).join("")}</div>` : ""}
        ${p.note === false ? "" : `<div class="noterow" style="margin-top:8px"><input type="text" class="inote" data-nnote="${esc(p.id)}" maxlength="120" placeholder="Catatan" aria-label="Catatan untuk ${esc(p.name)}"></div>`}</div>`; }).join("") || '<div class="empty">Belum ada menu.</div>'}
    <div class="grid2" style="margin-top:12px">
      <div><label class="lb" for="n-ong" style="margin-top:0">Ongkir (Rp)</label><input type="number" id="n-ong" min="0" step="500" inputmode="numeric" value="${flat()}"></div>
      <div><label class="lb" for="n-method" style="margin-top:0">Bayar via</label><select id="n-method"><option value="transfer">Transfer</option><option value="qris">QRIS</option></select></div>
      <div><label class="lb" for="n-pay" style="margin-top:0">Status bayar</label><select id="n-pay"><option value="cek">Belum bayar</option><option value="lunas">Lunas</option></select></div>
    </div>
    <div class="nbar"><div class="ntot"><span class="muted" id="n-sum"></span><b id="n-total">Rp 0</b></div>
    <button class="btn" id="n-save" type="button">Buat pesanan</button></div></div>`;
  nSync();
}
function nTotals(){ const ls = mLines(), food = ls.reduce((a, l) => a + l.price * l.qty, 0), ong = $("n-ong") ? Math.max(0, Math.round(Number($("n-ong").value) || 0)) : 0; return { ls, food, ong, total:food + ong }; }
function nSync(){
  document.querySelectorAll("#a-new [data-nk]").forEach(c => {
    const k = c.dataset.nk, s = k.split("::");
    c.querySelector("[data-q]").textContent = mcart[k] || 0;
    if ((s[1] || "").startsWith("+")) c.querySelector('[data-nd="1"]').disabled = (mcart[k] || 0) >= mMain(s[0]);
  });
  document.querySelectorAll("#a-new .nitem").forEach(n => { const inp = n.querySelector("[data-nnote]"); if (inp) n.classList.toggle("on", mMain(inp.dataset.nnote) > 0); });
  const t = nTotals(); $("n-total").textContent = rp(t.total); $("n-sum").textContent = `Menu ${rp(t.food)} + ongkir ${rp(t.ong)}`;
}
function manualText(o, paid){
  const pk = o.fulfil === "ambil";
  return `Halo kak ${o.nama}, pesananmu di Lapo Doli sudah kami catat.

No. Pesanan: ${o.id}
${pk ? "Ambil" : "Antar"} ${dLong(o.poDate)}, jam ${o.hours}${pk ? "\nLokasi ambil: " + o.pickupLoc : ""}
${o.items.map(i => `- ${i.qty} × ${i.name}${i.option ? " (" + i.option + ")" : ""}${i.note ? "\n  Catatan: " + i.note : ""}`).join("\n")}${o.ongkir ? "\nOngkir: " + rp(o.ongkir) : ""}

Total: ${rp(o.total)}

${paid ? "Pembayaran sudah kami terima. Terima kasih!" : "Pembayaran: transfer ke " + settings.bankName + " " + settings.bankNumber + " " + settings.bankHolder + (settings.qrisUrl ? " atau bayar lewat QRIS" : "") + ". Mohon kirim bukti bayar ke chat ini."}`;
}
async function createManual(){
  const g = k => $("n-" + k).value, pick = document.querySelector("[name=nf]:checked").value === "ambil";
  let ok = true; const chk = (k, m) => { $("n-e-" + k).textContent = m; if (m) ok = false; };
  chk("nama", val.nama(g("nama"))); chk("hp", val.hp(g("hp")));
  const nArea = areaFromText(g("alamat"));
  if (pick) chk("alamat", ""); else { chk("alamat", val.alamat(g("alamat"))); if (!ok) {} else if (!nArea) chk("alamat", "Tulis kotanya, misalnya Jakarta Selatan."); }
  const t = nTotals(), po = (pos || []).find(x => x.id === g("po"));
  if (!po) { toast("Pilih tanggal PO dulu"); return; }
  if (!t.ls.some(l => !l.addon)) { toast("Pilih minimal satu menu"); return; }
  if (!ok) { const f = document.querySelector("#a-new .err:not(:empty)"); if (f) f.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
  const btn = $("n-save"); btn.disabled = true;
  try {
    const seenN = {}, lines = t.ls.map(l => { let note = ""; if (!l.addon && !seenN[l.pid]) { seenN[l.pid] = 1; const el = document.querySelector(`[data-nnote="${l.pid}"]`); note = el ? el.value.trim() : ""; }
      return linePayload({ ...l, note }); });
    const paid = g("pay") === "lunas";
    const res = await api.createOrders({ nama:g("nama").trim(), hp:g("hp").trim(), fulfil:pick ? "ambil" : "antar", area:pick ? "" : nArea, alamat:pick ? "" : g("alamat").trim(),
      notes:g("notes").trim(), method:g("method"), ongkir:t.ong, paid, source:"wa", groups:[{ po_id:po.id, lines }] }, true);
    const r = res[0], id = r.id;
    const o = { id, nama:g("nama").trim(), hp:g("hp").trim(), fulfil:r.fulfil, poDate:r.po_date, hours:r.hours, pickupLoc:r.pickup_loc, items:r.items,
      ongkir:r.total - r.items.reduce((a, i) => a + i.price * i.qty, 0), total:r.total };
    refreshOrders();
    const txt = manualText(o, paid);
    $("a-new").innerHTML = `<div class="nform"><div class="okbox"><h3>Pesanan ${esc(id)} dibuat</h3><span class="muted">${esc(o.nama)} · ${esc(dShort(o.poDate))} · ${rp(o.total)} · ${paid ? "sudah lunas" : "menunggu cek bayar"}</span></div>
      <label class="lb" for="n-text" style="margin-top:0">Teks balasan untuk pelanggan</label><textarea id="n-text" readonly style="min-height:200px">${esc(txt)}</textarea>
      <div class="acts"><button class="btn" data-ncopy type="button">${ic("copy")}Salin teks</button><a class="btn line" target="_blank" rel="noopener" href="https://wa.me/${normPhone(o.hp)}?text=${encodeURIComponent(txt)}">Buka WhatsApp pelanggan</a></div>
      <div class="acts" style="margin-top:18px"><button class="btn line" data-nagain type="button">Buat pesanan lain</button><button class="btn line" data-nclose type="button">Kembali ke daftar</button></div></div>`;
    window.scrollTo({ top:0 });
  } catch (e) { toast("Belum tersimpan. Coba lagi."); btn.disabled = false; }
}
const newEl = $("a-new");
newEl.addEventListener("click", async e => {
  const d = e.target.closest("[data-nd]");
  if (d) {
    const key = d.closest("[data-nk]").dataset.nk, pid = key.split("::")[0];
    mcart[key] = Math.max(0, (mcart[key] || 0) + Number(d.dataset.nd)); if (!mcart[key]) delete mcart[key];
    if (!(key.split("::")[1] || "").startsWith("+")) mClamp(pid);
    nSync(); return;
  }
  if (e.target.closest("[data-nclose]")) { closeNew(); return; }
  if (e.target.closest("[data-nagain]")) { openNew(); return; }
  if (e.target.closest("[data-nsave]") || e.target.id === "n-save") { createManual(); return; }
  if (e.target.closest("[data-ncopy]")) {
    const ta = $("n-text");
    try { await navigator.clipboard.writeText(ta.value); toast("Teks disalin"); } catch (err) { ta.select(); toast("Salin manual: teks sudah dipilih"); }
  }
});
newEl.addEventListener("change", e => {
  if (e.target.name === "nf") { const pk = e.target.value === "ambil"; $("n-addr").hidden = pk; $("n-ong").value = pk ? 0 : flat(); nSync(); }
});
newEl.addEventListener("input", e => { if (e.target.id === "n-ong") nSync(); });

/* --- PO --- */
function renderAdminPo(){
  const el = $("a-po");
  if (pos === null) { el.innerHTML = '<p class="note">Memuat PO...</p>'; return; }
  const list = [...pos].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const rows = list.map(po => {
    const os = orders.filter(o => o.poId === po.id && o.status !== "batal" && o.payStatus !== "ditolak");
    const lunas = os.filter(o => o.payStatus === "lunas").length, rk = {};
    os.forEach(o => o.items.forEach(i => { const k = i.addon ? i.name : i.name + (i.option ? " (" + i.option + ")" : ""); rk[k] = (rk[k] || 0) + (Number(i.qty) || 0); }));
    const rekap = Object.keys(rk).map(k => `<li>${esc(k)} × ${rk[k]}</li>`).join("");
    const noteLines = os.flatMap(o => o.items.filter(i => i.note).map(i => `${o.id} · ${i.name}${i.option && !i.addon ? " (" + i.option + ")" : ""}: ${i.note}`)).concat(os.filter(o => o.notes).map(o => `${o.id} · pesanan: ${o.notes}`));
    const auto = po.open === true && isPast(po), on = po.open === true && !auto, sched = poScheduled(po);
    const adv = !poAdvOpen.has(po.id) ? "" : `<div class="po-adv" data-poadv="${esc(po.id)}">
      <div class="fgrid"><div><label class="fl" for="pc-${esc(po.id)}">Tutup pukul</label><input id="pc-${esc(po.id)}" data-pocutoff type="text" inputmode="numeric" maxlength="5" placeholder="${cutoffLabel()}" value="${esc(String(po.cutoff || "").replace(":", "."))}"><p class="fhint">Kosong ikut Pengaturan (${cutoffLabel()}).</p></div>
      <div class="full"><div class="fl">Kuota khusus PO ini</div><div class="pq">${(products || []).map(p => `<label class="pqrow"><span>${esc(p.name)}</span><input type="number" min="0" data-poquota="${esc(p.id)}" placeholder="${p.quota == null ? "Tanpa batas" : "Ikut " + p.quota}" value="${po.quotas && po.quotas[p.id] != null ? po.quotas[p.id] : ""}" aria-label="Kuota ${esc(p.name)}"></label>`).join("")}</div></div></div>
      <div class="acts"><button class="btn line sm" data-podup type="button">${ic("copy")}Gandakan ke minggu berikutnya</button></div></div>`;
    return `<div class="porow ${on ? "" : "off"}" data-po="${esc(po.id)}">
      <div class="po-h"><div><h3>${esc(dLong(po.date))}</h3><span class="note">${sched ? `Buka ${esc(fmtWhen(po.opens_at))}` : `${os.length} pesanan${os.length ? `, ${lunas} lunas` : ""}`}</span></div>
        <button class="textbtn po-gear" data-poadvbtn type="button" aria-expanded="${poAdvOpen.has(po.id)}" aria-label="Pengaturan PO ini" title="Jam tutup, kuota, dan gandakan PO">${ic("settings")}<span class="gl">Atur</span></button>
        <label class="switch"><input type="checkbox" id="po-open-${esc(po.id)}" data-poopen ${on ? "checked" : ""} ${auto ? "disabled" : ""}><span class="track"></span><span>${sched ? "Terjadwal" : on ? "Buka" : auto ? "Tutup otomatis" : "Tutup"}</span></label>
        ${sched ? `<button class="textbtn opennow" data-popennow type="button">${ic("check")}Buka sekarang</button>` : ""}
        <button class="textbtn iconbtn-t ${armPoDel === po.id ? "dangerbtn" : ""}" data-podel type="button" aria-label="Hapus PO" title="Hapus PO">${armPoDel === po.id ? "Yakin hapus?" : ic("trash")}</button></div>${adv}</div>`;
  }).join("");
  el.innerHTML = `<section class="card newpo3">
      <h3>Buka PO baru</h3>
      <div class="np-row">
        <div class="np-f"><label class="fl" for="po-new">Tanggal PO <span class="dtxt" id="po-new-h">${poDraft.date ? esc(dLong(poDraft.date)) : ""}</span></label><input type="date" id="po-new" class="dtin" value="${esc(poDraft.date)}"></div>
        <div class="np-f"><div class="fl">Dibuka untuk pembeli</div><div class="stabs seg" role="group" aria-label="Kapan dibuka"><button type="button" data-powhen="now" aria-pressed="${poDraft.when === "now"}">Sekarang</button><button type="button" data-powhen="later" aria-pressed="${poDraft.when === "later"}">Jadwalkan</button></div></div>
        <div class="np-f" id="po-opens-w" ${poDraft.when === "later" ? "" : "hidden"}><label class="fl" for="po-opens">Waktu buka</label><input type="datetime-local" id="po-opens" class="dtin" value="${esc(poDraft.opens)}" title="Sebelum waktu ini PO tampil belum dibuka"></div>
        <button class="btn np-go" data-poadd type="button">${ic("plus")}<span id="po-add-t">${poDraft.when === "later" ? "Jadwalkan PO" : "Buka PO"}</span></button>
      </div>
    </section>
    ${rows || '<div class="empty">Belum ada PO.</div>'}`;
}
const poEl = $("a-po"), poAdvOpen = new Set(), poDraft = { date:"", when:"now", opens:"" };
poEl.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.poadv) { if (d.open) poAdvOpen.add(d.dataset.poadv); else poAdvOpen.delete(d.dataset.poadv); } }, true);
async function dupPo(po){
  const taken = new Set((pos || []).map(p => String(p.date))), d = new Date(po.date + "T00:00:00Z");
  do { d.setUTCDate(d.getUTCDate() + 7); } while (taken.has(d.toISOString().slice(0, 10)));
  const date = d.toISOString().slice(0, 10);
  try { await api.insertPo({ id:"po-" + date.replace(/-/g, ""), date, open:true, opens_at:null, cutoff:po.cutoff || "", quotas:po.quotas || {} }); await refreshPos(); logAct("gandakan_po", po.id, date); toast("PO " + dShort(date) + " dibuat dari salinan"); }
  catch (e) { toast("Belum berhasil menggandakan. Jalankan ulang schema.sql terbaru."); }
}
poEl.addEventListener("click", e => {
  const gb = e.target.closest("[data-poadvbtn]");
  if (gb) { const id = gb.closest("[data-po]").dataset.po; if (poAdvOpen.has(id)) poAdvOpen.delete(id); else poAdvOpen.add(id); renderAdminPo(); return; }
  const b = e.target.closest("[data-podup]"); if (!b) return; const po = (pos || []).find(p => p.id === b.closest("[data-po]").dataset.po); if (po) dupPo(po); });
let poDirty = false;
function renderPoSafe(){
  const a = document.activeElement;
  if (a && poEl.contains(a) && a.matches("input[type=date], [data-pocutoff], [data-poquota]")) { poDirty = true; return; }
  poDirty = false; renderAdminPo();
}
poEl.addEventListener("focusout", () => setTimeout(() => { if (poDirty) renderPoSafe(); }, 50));
poEl.addEventListener("input", e => {
  if (e.target.id === "po-new") { poDraft.date = e.target.value; $("po-new-h").textContent = dparse(e.target.value) ? dLong(e.target.value) : ""; }
  else if (e.target.id === "po-opens") poDraft.opens = e.target.value;
});
poEl.addEventListener("change", async e => {
  const t = e.target;
  if (t.matches("[data-pocutoff]")) {
    const id = t.closest("[data-po]").dataset.po, raw = t.value.trim(); let v = "";
    if (raw) { if (!/^\d{1,2}[:.]\d{2}$/.test(raw)) { toast("Format jam salah. Contoh: 10.00"); renderAdminPo(); return; } v = raw.replace(".", ":").padStart(5, "0"); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { toast("Jam tidak valid."); renderAdminPo(); return; } }
    try { await api.setPoFields(id, { cutoff:v }); await refreshPos(); logAct("batas_tutup_po", id, v || "ikut pengaturan"); toast(v ? "Tutup pukul " + v.replace(":", ".") : "Ikut jam di Pengaturan"); } catch (err) { toast("Belum tersimpan. Jalankan ulang schema.sql terbaru."); renderAdminPo(); }
    return;
  }
  if (t.matches("[data-poquota]")) {
    const row = t.closest("[data-po]"), id = row.dataset.po, q = {};
    row.querySelectorAll("[data-poquota]").forEach(i => { if (i.value.trim() !== "") q[i.dataset.poquota] = Math.max(0, Math.round(Number(i.value) || 0)); });
    try { await api.setPoFields(id, { quotas:q }); await refreshPos(); logAct("kuota_po", id, JSON.stringify(q)); toast("Kuota PO disimpan"); } catch (err) { toast("Belum tersimpan. Jalankan ulang schema.sql terbaru."); renderAdminPo(); }
    return;
  }
  if (!t.matches("[data-poopen]")) return;
  const id = t.closest("[data-po]").dataset.po;
  try { await api.setPoOpen(id, t.checked); await refreshPos(); toast(t.checked ? "PO dibuka" : "PO ditutup"); }
  catch (err) { toast("Belum tersimpan. Coba lagi."); renderAdminPo(); }
});
poEl.addEventListener("click", async e => {
  try {
    const pw = e.target.closest("[data-powhen]");
    if (pw) { poDraft.when = pw.dataset.powhen; $("po-opens-w").hidden = poDraft.when !== "later"; $("po-add-t").textContent = poDraft.when === "later" ? "Jadwalkan PO" : "Buka PO"; poEl.querySelectorAll("[data-powhen]").forEach(b => b.setAttribute("aria-pressed", String(b === pw))); return; }
    if (e.target.closest("[data-poadd]")) {
      const v = $("po-new").value;
      if (!dparse(v)) { toast("Pilih tanggal PO dulu"); return; }
      const id = "po-" + v.replace(/-/g, "");
      if ((pos || []).some(p => p.id === id)) { toast("PO tanggal itu sudah ada"); return; }
      const ov = poDraft.when === "later" ? $("po-opens").value : "", opensAt = ov ? new Date(ov) : null;
      if (poDraft.when === "later" && !ov) { toast("Isi waktu buka, atau pilih Sekarang."); return; }
      if (opensAt && isNaN(opensAt)) { toast("Waktu buka tidak valid"); return; }
      await api.addPo(v, opensAt ? opensAt.toISOString() : null); await refreshPos();
      poDraft.date = ""; poDraft.opens = ""; poDraft.when = "now"; renderAdminPo();
      toast(opensAt ? "PO dijadwalkan" : "PO dibuka"); return;
    }
    if (e.target.closest("[data-popennow]")) {
      const id = e.target.closest("[data-po]").dataset.po;
      await api.setPoOpensAt(id, null); await refreshPos(); toast("PO dibuka"); return;
    }
    const d = e.target.closest("[data-podel]");
    if (d) {
      const id = d.closest("[data-po]").dataset.po;
      if (orders.some(o => o.poId === id)) { toast("Sudah ada pesanan di PO ini. Tutup saja, jangan dihapus."); return; }
      if (armPoDel !== id) { armPoDel = id; renderAdminPo(); return; }
      armPoDel = null; await api.deletePo(id); await refreshPos(); toast("PO dihapus");
    }
  } catch (err) { toast("Belum tersimpan. Coba lagi."); }
});

/* --- menu dan harga --- */
const thumbAdmin = p => imgSrc(p) ? `<img src="${esc(imgSrc(p))}" alt="${esc(p.name)}">` : `<span class="pempty">${ic("image")}<b>Tambah foto</b></span>`;
const advOpen = new Set();
function renderAdminMenu(){
  const el = $("a-menu");
  if (products === null) { el.innerHTML = '<p class="note">Memuat menu...</p>'; return; }
  const rows = products.map(p => `
    <div class="prow ${p.available === false ? "off" : ""}" data-pid="${esc(p.id)}">
      <div class="pphoto${imgSrc(p) ? "" : " none"}">
        <label class="pimg" title="${imgSrc(p) ? "Ganti foto" : "Tambah foto"}">${thumbAdmin(p)}<span class="pbusy" aria-hidden="true"><i></i></span>${assetsNs ? `<input type="file" accept="image/*" data-up id="up-${esc(p.id)}" aria-label="${imgSrc(p) ? "Ganti" : "Tambah"} foto ${esc(p.name)}">` : ""}</label>
        ${assetsNs && imgSrc(p) ? `<div class="pacts"><label class="pact" for="up-${esc(p.id)}">Ganti</label><button type="button" class="pact del" data-delimg aria-label="Hapus foto ${esc(p.name)}">Hapus</button></div>` : ""}
      </div>
      <div class="pmain">
        <div class="fgrid">
          <div class="full"><label class="fl" for="n-${esc(p.id)}">Nama</label><input type="text" id="n-${esc(p.id)}" data-f="name" value="${esc(p.name)}"></div>
          <div><label class="fl" for="pr-${esc(p.id)}">Harga (Rp)</label><input type="text" id="pr-${esc(p.id)}" data-f="price" value="${(Number(p.price) || 0).toLocaleString("id-ID")}" inputmode="numeric" autocomplete="off"></div>
          <div><label class="fl" for="q-${esc(p.id)}">Kuota per PO</label><input type="number" id="q-${esc(p.id)}" data-f="quota" value="${p.quota == null ? "" : p.quota}" min="0" step="1" inputmode="numeric" placeholder="Tanpa batas"></div>
          <div class="full"><label class="fl" for="d-${esc(p.id)}">Deskripsi</label><input type="text" id="d-${esc(p.id)}" data-f="desc" value="${esc(p.desc)}"></div>
        </div>
        <details class="adv" data-adv="${esc(p.id)}" ${advOpen.has(p.id) ? "open" : ""}><summary>Varian dan tambahan</summary>
          <div class="fgrid">
            <div class="full"><label class="fl" for="op-${esc(p.id)}">Varian pilihan</label><input type="text" id="op-${esc(p.id)}" data-f="options" value="${esc((Array.isArray(p.options) ? p.options : []).join(", "))}" placeholder="250ml=35000, 500ml=65000"><p class="fhint">Pisahkan dengan koma. Harga beda: nama=harga.</p></div>
            <div class="full"><label class="fl" for="ad-${esc(p.id)}">Tambahan</label><input type="text" id="ad-${esc(p.id)}" data-f="addons" value="${esc(fmtAddons(p))}" placeholder="Nasi=5000, Sop=0"><p class="fhint">Format nama=harga. Harga 0 berarti gratis.</p></div>
            <div class="full"><label class="chk"><input type="checkbox" id="nt-${esc(p.id)}" data-f="note" ${p.note === false ? "" : "checked"}><span>Pembeli boleh menulis catatan</span></label></div>
          </div></details>
        <div class="pbar"><label class="switch"><input type="checkbox" id="av-${esc(p.id)}" data-f="available" ${p.available === false ? "" : "checked"}><span class="track"></span><span>${p.available === false ? "Habis" : "Tersedia"}</span></label>
          <span class="pmove"><button class="textbtn iconbtn-t" data-move="up" type="button" aria-label="Naikkan ${esc(p.name)}" title="Naikkan" ${products.indexOf(p) === 0 ? "disabled" : ""}>${ic("up")}</button><button class="textbtn iconbtn-t" data-move="down" type="button" aria-label="Turunkan ${esc(p.name)}" title="Turunkan" ${products.indexOf(p) === products.length - 1 ? "disabled" : ""}>${ic("down")}</button></span>
          <button class="textbtn ${armDel === p.id ? "dangerbtn" : ""}" data-del type="button">${armDel === p.id ? "Yakin hapus menu ini?" : ic("trash") + "Hapus"}</button></div>
      </div></div>`).join("");
  const noQuota = products.filter(p => p.available !== false && (p.quota == null));
  el.innerHTML = `
    ${noQuota.length ? `<div class="latebar warnq" role="note">${ic("ban")}<span>${noQuota.length} menu belum punya kuota (${noQuota.map(p => esc(p.name)).join(", ")}). Pesanan tidak dibatasi, jadi bisa melebihi kapasitas dapur.</span></div>` : ""}
    <div class="toolbar"><span></span><button class="btn sm add" data-add type="button">${ic("plus")}Tambah menu</button></div>
    ${rows || `<div class="empty">Belum ada menu.<br><button class="btn sm" style="display:inline-block;margin-top:12px" data-seed>Isi menu awal</button></div>`}`;
}
const menuEl = $("a-menu");
let menuDirty = false;
function renderMenuSafe(){
  const a = document.activeElement;
  if (a && menuEl.contains(a) && a.matches("input")) { menuDirty = true; return; }
  menuDirty = false; renderAdminMenu();
}
menuEl.addEventListener("focusout", () => setTimeout(() => { if (menuDirty) renderMenuSafe(); }, 50));
menuEl.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.adv) { if (d.open) advOpen.add(d.dataset.adv); else advOpen.delete(d.dataset.adv); } }, true);
async function shrink(file, max = 900, square = false){
  try {
    const bmp = await createImageBitmap(file), c = document.createElement("canvas");
    if (square) {   /* foto menu dipotong persegi dari tengah supaya seragam */
      const side = Math.min(bmp.width, bmp.height), out = Math.min(800, side);
      c.width = c.height = out; c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    } else {
      const s = Math.min(1, max / Math.max(bmp.width, bmp.height)); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    }
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.82)) || file;
  } catch (e) { return file; }
}
menuEl.addEventListener("change", async e => {
  const t = e.target, row = t.closest("[data-pid]"); if (!row) return;
  const pid = row.dataset.pid;
  try {
    if (t.matches("[data-up]")) {
      const f = t.files[0]; if (!f || !assetsNs) return;
      const ph = row.querySelector(".pphoto"), prev = (products.find(x => x.id === pid) || {}).image;
      ph.classList.add("busy");
      try {
        const blob = await shrink(f, 900, true);
        const path = await api.uploadImage(blob);
        await api.updateProduct(pid, { image:path }); if (prev) api.removeImage(prev);
        await refreshProducts(); toast(prev ? "Foto diganti" : "Foto ditambahkan");
      } finally { ph.classList.remove("busy"); }
      return;
    }
    const k = t.dataset.f; if (!k) return;
    let v;
    if (k === "available" || k === "note") v = t.checked;
    else if (k === "quota") v = t.value.trim() === "" ? null : Math.max(0, Math.round(Number(t.value) || 0));
    else if (k === "price") v = Math.max(0, parseInt(String(t.value).replace(/\D/g, ""), 10) || 0);
    else if (k === "options") v = t.value.split(",").map(s => s.trim()).filter(Boolean);
    else if (k === "addons") v = parseAddons(t.value);
    else v = t.value.trim();
    if (k === "name" && !v) { toast("Nama menu tidak boleh kosong"); renderAdminMenu(); return; }
    await api.updateProduct(pid, { [k]:v }); await refreshProducts(); toast("Tersimpan");
  } catch (err) { toast("Belum tersimpan. Coba lagi."); }
});
menuEl.addEventListener("click", async e => {
  try {
    if (e.target.closest("[data-add]")) {
      const max = Math.max(0, ...(products || []).map(p => Number(p.sort) || 0));
      await api.addProduct({ name:"Menu baru", desc:"", price:0, emoji:"🍽️", available:false, sort:max + 1, addons:[] }); await refreshProducts();
      toast("Menu baru ditambahkan. Isi nama dan harga, lalu aktifkan."); return;
    }
    const di = e.target.closest("[data-delimg]");
    if (di) {
      const row = di.closest("[data-pid]"), pid = row.dataset.pid, prev = (products.find(x => x.id === pid) || {}).image;
      const ph = row.querySelector(".pphoto"); ph.classList.add("leaving"); await new Promise(r => setTimeout(r, 200));
      try { await api.updateProduct(pid, { image:null }); if (prev) api.removeImage(prev); await refreshProducts(); toast("Foto dihapus"); }
      catch (err) { ph.classList.remove("leaving"); throw err; }
      return;
    }
    if (e.target.closest("[data-seed]")) {
      for (const p of DEFAULT_PRODUCTS) await api.upsertProduct(p);
      await refreshProducts();
      toast("Menu awal terisi"); return;
    }
    const mv = e.target.closest("[data-move]");
    if (mv) {
      const pid = mv.closest("[data-pid]").dataset.pid, i = products.findIndex(p => p.id === pid), j = i + (mv.dataset.move === "up" ? -1 : 1);
      if (i < 0 || j < 0 || j >= products.length) return;
      const arr = products.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
      for (let k = 0; k < arr.length; k++) if (Number(arr[k].sort) !== k + 1) await api.updateProduct(arr[k].id, { sort:k + 1 });
      await refreshProducts(); logAct("urut_menu", pid, mv.dataset.move); toast("Urutan menu diperbarui"); return;
    }
    const d = e.target.closest("[data-del]");
    if (d) {
      const pid = d.closest("[data-pid]").dataset.pid;
      if (armDel !== pid) { armDel = pid; renderAdminMenu(); return; }
      armDel = null; await api.deleteProduct(pid); await refreshProducts(); toast("Menu dihapus");
    }
  } catch (err) { toast("Belum tersimpan. Coba lagi."); }
});

/* --- pengaturan --- */
function renderAdminSet(){
  const s = settings, el = $("a-set");
  const f = (id, key, label, val, opts = "", full = false) => `<div class="${full ? "full" : ""}"><label class="fl" for="${id}">${label}</label><input type="${opts.includes("number") ? "number" : "text"}" id="${id}" data-s="${key}" value="${esc(val)}" ${opts}></div>`;
  el.innerHTML = `
    <section class="card setsec"><div class="gc-h"><span class="gc-ic">${ic("truck")}</span><div><h3>Toko dan pengantaran</h3></div></div><div class="fgrid">
      ${f("s-jam", "deliveryHours", "Jam pengantaran", s.deliveryHours, 'placeholder="12.00 - 14.00"')}
      ${f("s-pj", "pickupHours", "Jam ambil", s.pickupHours, 'placeholder="12.00 - 14.00"')}
      ${f("s-co", "poCutoff", "Tutup PO pukul", s.poCutoff, 'placeholder="10:00"')}
      ${f("s-og", "ongkir", "Ongkir (Rp, 0 = gratis)", Number(s.ongkir) || 0, 'number min="0" step="500" inputmode="numeric"')}
      ${f("s-wa", "waNumber", "WhatsApp admin (62...)", s.waNumber, 'inputmode="numeric"')}
      ${f("s-pl", "pickupLocation", "Lokasi ambil", s.pickupLocation, "", true)}
    </div></section>
    <section class="card setsec"><div class="gc-h"><span class="gc-ic">${ic("receipt")}</span><div><h3>Pembayaran</h3></div></div><div class="fgrid">
      ${f("s-bn", "bankName", "Nama bank", s.bankName)}
      ${f("s-bno", "bankNumber", "Nomor rekening", s.bankNumber, 'inputmode="numeric"')}
      ${f("s-bh", "bankHolder", "Atas nama", s.bankHolder)}
      ${f("s-pw", "payWindowMin", "Batas bayar (menit)", payMin(), 'number min="15" max="240" step="5" inputmode="numeric"')}
    </div>
    <p class="fhint">Pesanan tanpa bukti bayar dibatalkan setelah batas ini (15 sampai 240 menit). Pembeli bisa menambah 30 menit sekali.</p>
    <label class="switch setrow"><input type="checkbox" id="s-uc" data-s="uniqueCode" ${s.uniqueCode !== false ? "checked" : ""}><span class="track"></span><span>Kode unik Rp 1 sampai 100 di jumlah transfer${s.uniqueCode !== false ? "" : " (mati)"}</span></label>
    <div class="qrisbox">${s.qrisUrl ? `<img src="${esc(s.qrisUrl)}" alt="QRIS">` : ""}
      <div><div class="fl">QRIS</div>${s.qrisUrl ? "" : '<p class="fhint" style="margin:0 0 8px">Belum ada gambar.</p>'}
      <div class="acts">${assetsNs ? `<label class="btn line sm filebtn">${s.qrisUrl ? "Ganti" : "Unggah"}<input type="file" accept="image/*" id="s-qris" data-qris aria-label="Unggah gambar QRIS"></label>` : '<span class="fhint">Butuh akses edit.</span>'}${s.qrisUrl ? '<button class="btn line sm" data-qris-del type="button">Hapus</button>' : ""}</div></div></div></section>
    <section class="card setsec" id="nf-sec"><div class="gc-h"><span class="gc-ic">${ic("chat")}</span><div><h3>Notifikasi WhatsApp ke pembeli</h3></div></div>
      <label class="switch setrow"><input type="checkbox" id="nf-on" data-s="notifyOn" ${s.notifyOn ? "checked" : ""}><span class="track"></span><span>${s.notifyOn ? "Aktif" : "Mati"}</span></label>
      <div class="nkinds">${NKINDS.map(([k, l]) => `<label class="nk"><input type="checkbox" data-nk="${k}" ${(s.notifyKinds || {})[k] === false ? "" : "checked"}><span>${l}</span></label>`).join("")}</div>
      <p class="fhint" id="nf-state">Memuat status...</p>
      <details id="nf-d" ${nfOpen ? "open" : ""}><summary>Penyedia dan pesan uji</summary>
        <div class="fgrid"><div><label class="fl" for="nf-prov">Penyedia</label><select id="nf-prov"><option value="fonnte">Fonnte</option><option value="webhook">Webhook sendiri</option></select></div>
          <div><label class="fl" for="nf-tok">Token</label><input type="password" id="nf-tok" autocomplete="off" placeholder="Token"></div>
          <div class="full" id="nf-urlw" hidden><label class="fl" for="nf-url">URL webhook (menerima POST JSON: target, message, kind, ref)</label><input type="text" id="nf-url" autocomplete="off" placeholder="https://..."></div></div>
        <div class="acts"><button class="btn sm" id="nf-save" type="button">Simpan penyedia</button></div>
        <div class="fgrid"><div><label class="fl" for="nf-hp">Nomor untuk pesan uji</label><input type="text" id="nf-hp" inputmode="tel" value="${esc(s.waNumber || "")}"></div></div>
        <div class="acts"><button class="btn line sm" id="nf-test" type="button">${ic("chat")}Kirim pesan uji</button></div>
        <ul class="loglist" id="nf-list"></ul></details></section>
    <section class="card setsec" id="ad-sec"><div class="gc-h"><span class="gc-ic">${ic("users")}</span><div><h3>Admin</h3></div></div>
      <ul class="adlist" id="ad-list"><li class="note">Memuat...</li></ul>
      <label class="fl" for="ad-email">Tambah admin</label>
      <div class="ad-row"><input type="text" id="ad-email" inputmode="email" autocomplete="off" placeholder="email@admin.com"><button class="btn sm" id="ad-add" type="button">Tambah</button></div>
      <p class="fhint">Setelah ditambahkan, minta orang itu membuka link admin dan masuk dengan emailnya. Akun login dibuat otomatis saat pertama masuk. <button class="linkbtn" id="ad-copy" type="button">Salin link admin</button></p></section>
    <section class="card setsec"><details id="log-d" ${logOpen ? "open" : ""}><summary>${ic("history")}Aktivitas terbaru</summary><ul class="loglist" id="log-list"><li class="note">Memuat...</li></ul></details></section>`;
  if (logOpen) fillLog();
  fillNotify(); fillAdmins();
}
const NKINDS = [["dicatat", "Pesanan dicatat"], ["pengingat", "Pengingat bayar"], ["lunas", "Pembayaran diterima"], ["ditolak", "Bayar tidak cocok"], ["diantar", "Sedang diantar"], ["batal_otomatis", "Batal otomatis"]];
let logOpen = false, nfStatus = null, nfOpen = null, adArm = null;
async function fillAdmins(){
  const ul = $("ad-list"); if (!ul) return;
  try {
    const rows = await api.adminList(), me = String(session && session.user && session.user.email || "").toLowerCase(); if (!$("ad-list")) return;
    $("ad-list").innerHTML = rows.map(r => `<li><span class="ad-e">${esc(r.email)}${r.is_me || r.email === me ? ' <span class="otag">Anda</span>' : ""}</span><span class="chip st ${r.joined ? "ok" : ""}">${r.joined ? "Sudah masuk" : "Belum pernah masuk"}</span>${r.is_me || r.email === me ? '<span class="ad-sp"></span>' : `<button class="textbtn ${adArm === r.email ? "dangerbtn" : ""}" data-adrm="${esc(r.email)}" type="button">${adArm === r.email ? "Yakin hapus?" : "Hapus"}</button>`}</li>`).join("") || '<li class="note">Belum ada admin.</li>';
  } catch (e) { if ($("ad-list")) $("ad-list").innerHTML = '<li class="note">Daftar admin belum tersedia. Jalankan ulang schema.sql terbaru.</li>'; }
}
$("a-set").addEventListener("click", async e => {
  if (e.target.closest("#ad-copy")) { copyText(location.origin + "/?admin=1", $("ad-copy"), "Link admin disalin"); return; }
  const rm = e.target.closest("[data-adrm]");
  if (rm) {
    const em = rm.dataset.adrm;
    if (adArm !== em) { adArm = em; fillAdmins(); return; }
    adArm = null;
    try { await api.adminRemove(em); toast(em + " dihapus dari admin"); }
    catch (err) { const m = String(err && err.message || ""); toast(/cannot_remove_self/.test(m) ? "Kamu tidak bisa menghapus dirimu sendiri." : /last_admin/.test(m) ? "Admin terakhir tidak bisa dihapus." : "Belum tersimpan. Coba lagi."); }
    fillAdmins(); return;
  }
  if (e.target.closest("#ad-add")) {
    const em = $("ad-email").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast("Email tidak valid."); return; }
    try { await api.adminAdd(em); $("ad-email").value = ""; toast(em + " ditambahkan. Minta mereka masuk lewat link admin."); }
    catch (err) { const m = String(err && err.message || ""); toast(/too_many/.test(m) ? "Jumlah admin sudah maksimal (20)." : /invalid_email/.test(m) ? "Email tidak valid." : "Belum tersimpan. Jalankan ulang schema.sql terbaru."); }
    fillAdmins();
  }
});
async function fillNotify(){
  const st = $("nf-state"); if (!st) return;
  try { nfStatus = await api.secretStatus(); } catch (e) { nfStatus = null; }
  if (!$("nf-state")) return;
  if (!nfStatus) { $("nf-state").textContent = "Belum tersedia. Jalankan ulang schema.sql terbaru."; return; }
  const prov = $("nf-prov"); if (prov && document.activeElement !== prov) prov.value = nfStatus.provider || "fonnte";
  $("nf-urlw").hidden = (prov ? prov.value : "fonnte") !== "webhook";
  const tok = $("nf-tok"); if (tok) tok.placeholder = nfStatus.hasToken ? "Sudah tersimpan (isi untuk mengganti)" : "Token";
  const ready = nfStatus.provider === "fonnte" ? nfStatus.hasToken : nfStatus.provider === "webhook" ? nfStatus.hasUrl : false;
  const nd = $("nf-d"); if (nd && nfOpen === null) { nfOpen = !ready; nd.open = nfOpen; }
  $("nf-state").textContent = (ready ? "Penyedia terhubung." : "Penyedia belum diisi.") + (nfStatus.hasNet ? "" : " Ekstensi pg_net belum aktif di Supabase (Database, Extensions), pesan belum bisa dikirim.");
  try {
    const rows = await api.loadNotifyQueue(), ul = $("nf-list"); if (!ul) return;
    const lbl = Object.fromEntries(NKINDS.concat([["uji", "Pesan uji"]]));
    ul.innerHTML = rows.length ? rows.map(r => `<li><span class="lt">${esc(fmtTime(r.created_at))}</span><span><b>${esc(lbl[r.kind] || r.kind)}</b> ke ${esc(r.hp)} <span class="chip st ${r.status === "dikirim" ? "ok" : r.status === "gagal" ? "bad" : ""}">${esc(r.status)}</span>${r.error ? ` <small>${esc(r.error)}</small>` : ""}</span></li>`).join("") : '<li class="note">Belum ada pesan.</li>';
  } catch (e) {}
}
$("a-set").addEventListener("click", async e => {
  if (e.target.closest("#nf-save")) {
    const prov = $("nf-prov").value, tok = $("nf-tok").value.trim(), url = $("nf-url").value.trim();
    if (prov === "webhook" && !url && !(nfStatus && nfStatus.hasUrl)) { toast("Isi URL webhook."); return; }
    try { await api.setSecret("wa_provider", prov); if (tok) await api.setSecret("wa_token", tok); if (prov === "webhook" && url) await api.setSecret("wa_url", url); $("nf-tok").value = ""; logAct("penyedia_wa", prov); toast("Penyedia disimpan"); fillNotify(); }
    catch (err) { toast("Belum tersimpan. Jalankan ulang schema.sql terbaru."); }
    return;
  }
  if (e.target.closest("#nf-test")) {
    const hp = $("nf-hp").value.trim(); if (!hp) { toast("Isi nomor tujuan."); return; }
    try { const r = await api.notifyTest(hp); toast("Hasil uji: " + r); fillNotify(); } catch (err) { toast("Uji belum berhasil. Cek penyedia dan skema."); }
  }
});
$("a-set").addEventListener("toggle", e => { if (e.target.id === "nf-d") nfOpen = e.target.open; }, true);
$("a-set").addEventListener("change", e => {
  if (e.target.id === "nf-prov") { $("nf-urlw").hidden = e.target.value !== "webhook"; return; }
  if (e.target.matches("[data-nk]")) { const o = {}; $("a-set").querySelectorAll("[data-nk]").forEach(c => { o[c.dataset.nk] = c.checked; }); saveSetting({ notifyKinds:o }); }
});
const LOGL = { tambah_admin:"menambah admin", hapus_admin:"menghapus admin", status_massal:"mengubah status beberapa pesanan", refund_done:"menandai sudah refund", pay_ok:"mengonfirmasi bayar", pay_no:"menandai bayar tidak cocok", pay_undo:"membatalkan konfirmasi", next:"mengubah status", cancel:"membatalkan", reopen:"membuka lagi", konfirmasi_massal:"konfirmasi massal", batal_lewat_batas:"membatalkan yang lewat batas", batal_otomatis:"batal otomatis (lewat batas bayar)", penyedia_wa:"mengatur penyedia WhatsApp", urungkan:"mengurungkan", ubah_pesanan:"mengubah pesanan", catatan_pelanggan:"mengisi catatan pelanggan", gandakan_po:"menggandakan PO", batas_tutup_po:"mengatur batas tutup PO", kuota_po:"mengatur kuota PO", urut_menu:"menggeser urutan menu", salin_kurir:"menyalin daftar kurir" };
async function fillLog(){
  const ul = $("log-list"); if (!ul) return;
  try { const rows = await api.loadLog(); ul.innerHTML = rows.length ? rows.map(r => `<li><span class="lt">${esc(fmtTime(r.at))}</span><span><b>${esc(String(r.actor || "").split("@")[0] || "admin")}</b> ${esc(LOGL[r.action] || r.action)} <span class="mono">${esc(r.target)}</span></span></li>`).join("") : '<li class="note">Belum ada aktivitas.</li>'; }
  catch (e) { ul.innerHTML = '<li class="note">Log belum tersedia. Jalankan ulang schema.sql terbaru.</li>'; }
}
const setEl = $("a-set");
setEl.addEventListener("toggle", e => { if (e.target.id === "log-d") { logOpen = e.target.open; if (logOpen) fillLog(); } }, true);
let setDirty = false;
function renderSetSafe(){
  const a = document.activeElement;
  if (a && setEl.contains(a) && a.matches("input[type=text],input[type=number],input[type=password]")) { setDirty = true; return; }
  setDirty = false; renderAdminSet();
}
setEl.addEventListener("focusout", () => setTimeout(() => { if (setDirty) renderSetSafe(); }, 50));
async function saveSetting(patch){
  const next = { ...settings, ...patch }; delete next.qrisUrl;
  try {
    await api.saveSettings(next);
    settings = { ...settings, ...patch }; settings.qrisUrl = assetUrl(settings.qrisPath);
    renderPayInfo(); renderMenu(); if (view === "admin" && tab === "set") renderSetSafe();
    toast("Tersimpan");
  } catch (e) { toast("Belum tersimpan. Coba lagi."); }
}
setEl.addEventListener("change", async e => {
  const t = e.target;
  if (t.matches("[data-qris]")) {
    const f = t.files[0]; if (!f || !assetsNs) return;
    try { toast("Mengunggah..."); const blob = await shrink(f); const path = await api.uploadImage(blob); await saveSetting({ qrisPath:path }); }
    catch (err) { toast("Gambar belum terunggah. Coba lagi."); }
    return;
  }
  const k = t.dataset.s; if (!k) return;
  let v = t.type === "checkbox" ? t.checked : t.type === "number" ? Math.max(0, Math.round(Number(t.value) || 0)) : t.value.trim();
  if (k === "waNumber") v = normPhone(v);
  if (k === "payWindowMin") v = Math.max(15, Math.min(240, v || 60));
  if (k === "poCutoff") { if (!/^\d{1,2}[:.]\d{2}$/.test(v)) { toast("Format jam salah. Contoh: 10.00"); renderAdminSet(); return; } v = v.replace(".", ":").padStart(5, "0"); }
  if (["deliveryHours", "pickupHours", "pickupLocation"].includes(k) && !v) v = DEFAULT_SETTINGS[k];
  await saveSetting({ [k]:v });
});
setEl.addEventListener("click", e => { if (e.target.closest("[data-qris-del]")) saveSetting({ qrisPath:"" }); });

/* --- penjualan --- */
let salesPo = "semua", salesBasis = "lunas", salesRange = 0, custFilter = "semua";
const fmtShort = n => n >= 1e6 ? (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits:1 }) + " jt" : n >= 1e3 ? Math.round(n / 1e3) + " rb" : String(Math.round(n));
const niceMax = v => { if (v <= 0) return 100000; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const foodOf = o => Math.max(0, o.total - o.ongkir);
const portionsOf = o => o.items.filter(i => !i.addon).reduce((a, i) => a + (Number(i.qty) || 0), 0);

function colChart(items){
  const mx = niceMax(Math.max(0, ...items.map(i => i.value))), ticks = [0, 1, 2, 3, 4].map(i => mx * i / 4);
  const top = items.reduce((a, i) => i.value > (a ? a.value : 0) ? i : a, null);
  return `<div class="cchart"><div class="yax" aria-hidden="true">${ticks.slice().reverse().map(t => `<span>${t ? fmtShort(t) : "0"}</span>`).join("")}</div>
    <div class="plotwrap"><div style="min-width:${items.length * 52}px">
      <div class="plot"><div class="grid">${ticks.map(() => "<i></i>").join("")}</div>
      <div class="cols">${items.map(i => `<button type="button" class="ccol ${i.dim ? "dim" : ""}" data-spo="${esc(i.id)}" data-tip data-a="${esc(rp(i.value))}" data-b="${esc(i.full)}" data-c="${esc(i.count + " pesanan")}" aria-label="${esc(i.full + ": " + rp(i.value) + ", " + i.count + " pesanan")}"><span class="cap">${i === top && i.value ? esc(fmtShort(i.value)) : ""}</span><span class="cbar" style="height:${mx ? (i.value / mx * 100).toFixed(1) : 0}%;${i.value > 0 ? "min-height:3px" : ""}"></span></button>`).join("")}</div></div>
      <div class="xrow">${items.map(i => `<span>${esc(i.label)}</span>`).join("")}</div></div></div></div>`;
}
function hbars(rows){
  const mx = Math.max(1, ...rows.map(r => r.value));
  return `<div class="hbars">${rows.map(r => `<div class="hrow" tabindex="0" data-tip data-a="${esc(r.a)}" data-b="${esc(r.label)}" data-c="${esc(r.c || "")}"><span class="hl">${esc(r.label)}</span><span class="ht"><span class="hb" style="--w:${(r.value / mx).toFixed(3)}"></span><span class="hv">${esc(String(r.value))}</span></span></div>`).join("")}</div>`;
}
function exportSales(){
  const live = orders.filter(o => o.status !== "batal" && o.payStatus !== "ditolak"), rows = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(p => {
    const os = live.filter(o => o.poId === p.id), paid = os.filter(o => o.payStatus === "lunas");
    return [p.date, os.length, os.reduce((t, o) => t + portionsOf(o), 0), paid.reduce((t, o) => t + foodOf(o), 0), paid.reduce((t, o) => t + o.ongkir, 0), os.filter(o => o.payStatus === "cek").reduce((t, o) => t + o.total, 0), paid.filter(o => o.method !== "qris").reduce((t, o) => t + o.total, 0), paid.filter(o => o.method === "qris").reduce((t, o) => t + o.total, 0)]; });
  downloadCsv("penjualan-lapo-doli-" + dayStart() + ".csv", ["Tanggal PO", "Pesanan", "Porsi", "Penjualan lunas", "Ongkir lunas", "Belum dicek bayar", "Transfer lunas", "QRIS lunas"], rows); toast("File CSV diunduh");
}
function renderSales(){
  const el = $("a-sales");
  if (ordersState === "loading") { el.innerHTML = '<p class="note">Memuat data penjualan...</p>'; return; }
  if (!orders.length) { el.innerHTML = '<div class="empty">Belum ada pesanan. Grafik penjualan muncul setelah pesanan pertama masuk.</div>'; return; }
  const poSorted = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (salesPo !== "semua" && !poSorted.some(p => p.id === salesPo)) salesPo = "semua";
  const live = orders.filter(o => o.status !== "batal" && o.payStatus !== "ditolak");
  const inBasis = o => salesBasis === "semua" || o.payStatus === "lunas";
  const withOrders = poSorted.filter(p => live.some(o => o.poId === p.id)), rangeIds = new Set((salesRange && salesPo === "semua" ? withOrders.slice(-salesRange) : poSorted).map(p => p.id));
  const scope = live.filter(o => salesPo === "semua" ? rangeIds.has(o.poId) : o.poId === salesPo);
  const base = scope.filter(inBasis), wait = scope.filter(o => o.payStatus === "cek");
  const food = base.reduce((a, o) => a + foodOf(o), 0), fee = base.reduce((a, o) => a + o.ongkir, 0), qty = base.reduce((a, o) => a + portionsOf(o), 0);
  const phones = {}; base.forEach(o => { const k = normPhone(o.hp); phones[k] = (phones[k] || 0) + 1; });
  const cust = Object.keys(phones).length, repeat = Object.values(phones).filter(n => n > 1).length;
  const waitSum = wait.reduce((a, o) => a + o.total, 0);

  const poVal = po => live.filter(o => o.poId === po.id && inBasis(o)).reduce((t, o) => t + foodOf(o), 0);
  const refPo = salesPo !== "semua" ? poSorted.find(p => p.id === salesPo) : withOrders[withOrders.length - 1], refIdx = refPo ? withOrders.findIndex(p => p.id === refPo.id) : -1, prevPo = refIdx > 0 ? withOrders[refIdx - 1] : null;
  const cmpTile = prevPo && poVal(prevPo) > 0 ? (() => { const d = Math.round((poVal(refPo) - poVal(prevPo)) / poVal(prevPo) * 100); return `<div class="tile"><span>Dibanding PO sebelumnya</span><b class="${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d}%</b><small>${rp(poVal(refPo))} vs ${rp(poVal(prevPo))} (${esc(dShort(prevPo.date))})</small></div>`; })() : `<div class="tile"><span>Dibanding PO sebelumnya</span><b>-</b><small>Belum ada pembanding</small></div>`;
  const items = poSorted.filter(po => rangeIds.has(po.id)).map(po => { const os = live.filter(o => o.poId === po.id && inBasis(o));
    return { id:po.id, label:dShort(po.date).replace(/^\S+,?\s*/, ""), full:dLong(po.date), value:os.reduce((a, o) => a + foodOf(o), 0), count:os.length, dim:salesPo !== "semua" && salesPo !== po.id }; });

  const menu = {}, add = {};
  base.forEach(o => o.items.forEach(i => { const q = Number(i.qty) || 0, t = i.addon ? add : menu, r = t[i.name] || (t[i.name] = { qty:0, rev:0, opts:{} });
    r.qty += q; r.rev += q * (Number(i.price) || 0); if (!i.addon && i.option) r.opts[i.option] = (r.opts[i.option] || 0) + q; }));
  const menuRows = Object.keys(menu).map(n => ({ label:n, value:menu[n].qty, a:menu[n].qty + " porsi", c:rp(menu[n].rev) + (Object.keys(menu[n].opts).length ? " · " + Object.keys(menu[n].opts).map(k => k + " " + menu[n].opts[k]).join(", ") : "") })).sort((a, b) => b.value - a.value);
  const nAntar = base.filter(o => o.fulfil !== "ambil").length, nAmbil = base.length - nAntar, tot = Math.max(1, base.length);
  const area = {}; base.filter(o => o.fulfil !== "ambil").forEach(o => { const k = o.area || "Tanpa wilayah"; area[k] = (area[k] || 0) + 1; });
  const areaRows = Object.keys(area).map(k => ({ label:k, value:area[k], a:area[k] + " pesanan", c:"" })).sort((a, b) => b.value - a.value);
  const seg = (cls, n, name) => n ? `<div class="sg ${cls}" style="flex:${n}" data-tip tabindex="0" data-a="${n} pesanan" data-b="${name}" data-c="${Math.round(n / tot * 100)}%">${n / tot >= .18 ? Math.round(n / tot * 100) + "%" : ""}</div>` : "";

  el.innerHTML = `<div class="sales">
    <div class="toolbar">
      <select id="s-po" class="sel" aria-label="Filter tanggal PO"><option value="semua">Semua tanggal</option>${poSorted.map(p => `<option value="${esc(p.id)}" ${p.id === salesPo ? "selected" : ""}>${esc(dShort(p.date))}</option>`).join("")}</select>
      ${salesPo === "semua" ? `<div class="stabs" role="group" aria-label="Rentang PO">${[[0, "Semua"], [4, "4 PO terakhir"], [8, "8 PO terakhir"]].map(([n, l]) => `<button type="button" data-srange="${n}" aria-pressed="${salesRange === n}">${l}</button>`).join("")}</div>` : ""}
      <div class="stabs" role="group" aria-label="Dasar hitung"><button type="button" data-sbasis="lunas" aria-pressed="${salesBasis === "lunas"}">Lunas</button><button type="button" data-sbasis="semua" aria-pressed="${salesBasis === "semua"}">Semua</button></div>
      <button class="btn line sm iconbtn" data-sexport type="button" aria-label="Ekspor penjualan per PO ke CSV" title="Ekspor penjualan per PO ke CSV">${ic("download")}</button>
    </div>
    <div class="herostat"><span class="k">Penjualan${salesBasis === "lunas" ? " lunas" : ""}</span><b>${rp(food)}</b><span class="s">${base.length} pesanan, masuk ${rp(food + fee)} dengan ongkir</span></div>
    <div class="tiles">
      <div class="tile"><span>Porsi terjual</span><b>${qty}</b></div>
      <div class="tile"><span>Rata-rata pesanan</span><b>${base.length ? rp(Math.round(food / base.length)) : "-"}</b></div>
      <div class="tile"><span>Pelanggan</span><b>${cust}</b><small>${repeat ? `<button class="linkbtn" data-goto-cust type="button">${repeat} berulang</button>` : "0 berulang"}</small></div>
      ${cmpTile}
      <div class="tile"><span>Belum dicek bayar</span><b>${rp(waitSum)}</b><small>${wait.length} pesanan</small></div>
    </div>
    <div class="panels">
      <div class="panel wide"><h3>Penjualan per tanggal PO</h3>${items.length ? colChart(items) : '<p class="note">Belum ada PO.</p>'}</div>
      <div class="panel"><h3>Menu terlaris</h3>${menuRows.length ? hbars(menuRows) : '<p class="note">Belum ada data.</p>'}</div>
      <div class="panel"><h3>Antar atau ambil sendiri</h3>${base.length ? `<div class="stack">${seg("a", nAntar, "Antar")}${seg("b", nAmbil, "Ambil sendiri")}</div><div class="legend"><span><i class="sw a"></i>Antar <b>${nAntar}</b></span><span><i class="sw b"></i>Ambil sendiri <b>${nAmbil}</b></span></div>` : '<p class="note">Belum ada data.</p>'}</div>
      <div class="panel"><h3>Metode bayar</h3>${base.length ? (() => { const m = {}; base.forEach(o => { const k = o.method === "qris" ? "QRIS" : "Transfer"; const r = m[k] || (m[k] = { n:0, s:0 }); r.n++; r.s += o.total; }); return hbars(Object.keys(m).map(k => ({ label:k, value:m[k].n, a:m[k].n + " pesanan", c:rp(m[k].s) })).sort((x, y) => y.value - x.value)); })() : '<p class="note">Belum ada data.</p>'}</div>
      <div class="panel"><h3>Wilayah pengantaran</h3>${areaRows.length ? hbars(areaRows) : '<p class="note">Belum ada pesanan antar.</p>'}</div>
      <div class="panel"><h3>Nasi dan sop</h3>${Object.keys(add).length ? hbars(Object.keys(add).map(n => ({ label:n, value:add[n].qty, a:add[n].qty + " porsi", c:add[n].rev ? rp(add[n].rev) : "Gratis" })).sort((a, b) => b.value - a.value)) : '<p class="note">Belum ada tambahan.</p>'}</div>
    </div>
    <details class="tview panel"><summary>Lihat sebagai tabel</summary><div class="tw"><table class="dt"><thead><tr><th>Tanggal PO</th><th class="r">Pesanan</th><th class="r">Porsi</th><th class="r">Penjualan</th></tr></thead><tbody>${poSorted.map(po => { const os = live.filter(o => o.poId === po.id && inBasis(o));
      return `<tr><td>${esc(dShort(po.date))}</td><td class="r">${os.length}</td><td class="r">${os.reduce((a, o) => a + portionsOf(o), 0)}</td><td class="r">${rp(os.reduce((a, o) => a + foodOf(o), 0))}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="tw"><table class="dt"><thead><tr><th>Menu</th><th class="r"></th><th class="r">Porsi</th><th class="r">Penjualan</th></tr></thead><tbody>${Object.keys(menu).map(n => `<tr><td>${esc(n)}</td><td class="r"></td><td class="r">${menu[n].qty}</td><td class="r">${rp(menu[n].rev)}</td></tr>`).join("") || '<tr><td colspan="3">Belum ada data.</td></tr>'}</tbody></table></div></details>
  </div>`;
}
const tipEl = $("tip");
function showTip(el, x, y){
  tipEl.replaceChildren();
  const a = document.createElement("b"); a.textContent = el.dataset.a || ""; tipEl.append(a);
  const b = document.createElement("span"); b.textContent = el.dataset.b || ""; tipEl.append(b);
  if (el.dataset.c) { const c = document.createElement("small"); c.textContent = el.dataset.c; tipEl.append(c); }
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8) + "px";
  tipEl.style.top = (y - r.height - 14 < 8 ? y + 18 : y - r.height - 14) + "px";
}
const salesEl = $("a-sales");
salesEl.addEventListener("pointermove", e => { const t = e.target.closest("[data-tip]"); if (t) showTip(t, e.clientX, e.clientY); else tipEl.hidden = true; });
salesEl.addEventListener("pointerleave", () => { tipEl.hidden = true; });
salesEl.addEventListener("focusin", e => { const t = e.target.closest("[data-tip]"); if (t) { const r = t.getBoundingClientRect(); showTip(t, r.left + r.width / 2, r.top); } });
salesEl.addEventListener("focusout", () => { tipEl.hidden = true; });
salesEl.addEventListener("click", e => {
  const rg = e.target.closest("[data-srange]"); if (rg) { salesRange = Number(rg.dataset.srange); renderSales(); return; }
  if (e.target.closest("[data-goto-cust]")) { custFilter = "repeat"; setTab("cust"); return; }
  if (e.target.closest("[data-sexport]")) { exportSales(); return; }
  const f = e.target.closest("[data-spofilter]"), s = e.target.closest("[data-spo]"), b = e.target.closest("[data-sbasis]");
  if (f) salesPo = f.dataset.spofilter;
  else if (s) salesPo = salesPo === s.dataset.spo ? "semua" : s.dataset.spo;
  else if (b) salesBasis = b.dataset.sbasis;
  else return;
  tipEl.hidden = true; renderSales();
});
salesEl.addEventListener("change", e => { if (e.target.id === "s-po") { salesPo = e.target.value; renderSales(); } });

/* --- rekap dapur dan ekspor --- */
let rekapPo = null, rekapBasis = "semua";
const dayStart = jakartaToday;
function rekapData(){
  const poSorted = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!rekapPo || !poSorted.some(p => p.id === rekapPo)) { const up = poSorted.find(p => p.date >= dayStart()); rekapPo = (up || poSorted[poSorted.length - 1] || {}).id || null; }
  const list = orders.filter(o => o.poId === rekapPo && o.status !== "batal" && o.payStatus !== "ditolak" && (rekapBasis === "semua" || o.payStatus === "lunas"));
  const cook = {}, add = {};
  list.forEach(o => o.items.forEach(i => { const q = Number(i.qty) || 0;
    if (i.addon) { add[i.name] = (add[i.name] || 0) + q; return; }
    const m = cook[i.name] || (cook[i.name] = { total:0, opts:{} }); m.total += q; const k = i.option || "Biasa"; m.opts[k] = (m.opts[k] || 0) + q; }));
  return { poSorted, list, cook, add, antar:list.filter(o => o.fulfil !== "ambil"), ambil:list.filter(o => o.fulfil === "ambil") };
}
const itemLine = o => o.items.map(i => `${i.qty}x ${i.name}${i.option && !i.addon ? " (" + i.option + ")" : i.addon ? " (" + i.option + ")" : ""}${i.note ? " [" + i.note + "]" : ""}`).join(", ");
function rekapText(r){
  const po = r.poSorted.find(p => p.id === rekapPo); if (!po) return "";
  const L = [`Rekap PO ${dLong(po.date)}`, `${r.list.length} pesanan`, "", "Yang dimasak:"];
  Object.keys(r.cook).forEach(n => L.push(`- ${n}: ${r.cook[n].total} porsi` + (Object.keys(r.cook[n].opts).length > 1 || !r.cook[n].opts["Biasa"] ? " (" + Object.keys(r.cook[n].opts).map(k => `${k} ${r.cook[n].opts[k]}`).join(", ") + ")" : "")));
  Object.keys(r.add).forEach(n => L.push(`- ${n}: ${r.add[n]}`));
  if (r.antar.length) { L.push("", "Antar:"); r.antar.forEach(o => L.push(`- ${o.id} ${o.nama} (${o.hp}), ${o.area}, ${o.alamat}: ${itemLine(o)}${o.notes ? " | " + o.notes : ""}`)); }
  if (r.ambil.length) { L.push("", "Ambil sendiri:"); r.ambil.forEach(o => L.push(`- ${o.id} ${o.nama} (${o.hp}): ${itemLine(o)}${o.notes ? " | " + o.notes : ""}`)); }
  return L.join("\n");
}
const csvCell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function downloadCsv(name, head, rows){
  const csv = "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" })), link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const mapHref = o => o.mapsUrl || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(((o.alamat || "") + " " + (o.area || "")).trim());
function exportCsv(){
  const head = ["No. pesanan", "Tanggal PO", "Dibuat", "Nama", "No. HP", "Antar/Ambil", "Wilayah", "Alamat", "Pesanan", "Catatan", "Ongkir", "Total", "Metode", "Status bayar", "Status", "Sumber"];
  const rows = orders.map(o => [o.id, o.poDate, o.createdAt, o.nama, o.hp, o.fulfil, o.area, o.alamat, itemLine(o), o.notes, o.ongkir, o.total, o.method, o.payStatus, o.status, o.source]);
  const csv = "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" })), link = document.createElement("a");
  link.href = url; link.download = "pesanan-lapo-doli-" + dayStart() + ".csv"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderRekap(){
  const el = $("a-rekap");
  if (ordersState === "loading" || pos === null) { el.innerHTML = '<p class="note">Memuat rekap...</p>'; return; }
  const r = rekapData();
  const orderCard = o => `<div class="rk-o"><div class="rk-top"><b>${esc(o.nama)}</b><span class="muted">${esc(o.id)}</span><a class="rk-wa" href="https://wa.me/${normPhone(o.hp)}" target="_blank" rel="noopener" aria-label="Chat ${esc(o.nama)}" title="Chat ${esc(o.hp)}">${ic("chat")}</a></div>${o.fulfil !== "ambil" ? `<div class="rk-r">${ic("pin")}<span>${esc(o.alamat)}</span><a class="maplink" href="${esc(mapHref(o))}" target="_blank" rel="noopener">${o.mapsUrl ? "Buka peta" : "Cari di peta"}</a></div>` : ""}<ul class="rk-i">${o.items.map(i => `<li><span class="q">${Number(i.qty) || 0}×</span><span>${esc(i.name)}${i.option ? " (" + esc(i.option) + ")" : ""}${i.note ? ` <em>${esc(i.note)}</em>` : ""}</span></li>`).join("")}</ul>${o.notes ? `<div class="rk-note">${esc(o.notes)}</div>` : ""}</div>`;
  const areas = {}; r.antar.forEach(o => { (areas[o.area || "Tanpa wilayah"] = areas[o.area || "Tanpa wilayah"] || []).push(o); });
  el.innerHTML = `<div class="kitchen">
    <div class="toolbar rk-tools">
      <select id="rk-po" class="sel" aria-label="Tanggal PO">${r.poSorted.map(p => `<option value="${esc(p.id)}" ${p.id === rekapPo ? "selected" : ""}>${esc(dLong(p.date))}</option>`).join("")}</select>
      <div class="stabs" role="group" aria-label="Pesanan yang dihitung"><button type="button" data-rkb="semua" aria-pressed="${rekapBasis === "semua"}">Semua</button><button type="button" data-rkb="lunas" aria-pressed="${rekapBasis === "lunas"}">Lunas</button></div>
      <div class="acts tools"><button class="btn line sm iconbtn" data-rk="copy" type="button" aria-label="Salin rekap" title="Salin rekap">${ic("copy")}</button><button class="btn line sm iconbtn" data-rk="courier" type="button" aria-label="Salin daftar antar untuk kurir" title="Salin daftar antar untuk kurir">${ic("truck")}</button><button class="btn line sm iconbtn" data-rk="print" type="button" aria-label="Cetak rekap" title="Cetak rekap">${ic("print")}</button><button class="btn line sm iconbtn" data-rk="csv" type="button" aria-label="Ekspor semua pesanan ke CSV" title="Ekspor semua pesanan ke CSV">${ic("download")}</button></div>
    </div>
    ${r.list.length ? `
    <div class="panels">
      <div class="panel"><h3>Dimasak (${r.list.length} pesanan)</h3>
        <table class="rk-t"><tbody>${Object.keys(r.cook).map(n => `<tr><th scope="row">${esc(n)}</th><td class="r"><b>${r.cook[n].total}</b> porsi</td></tr>${Object.keys(r.cook[n].opts).filter(k => k !== "Biasa" || Object.keys(r.cook[n].opts).length > 1).map(k => `<tr class="rk-sub"><td>${esc(k)}</td><td>${r.cook[n].opts[k]}</td></tr>`).join("")}`).join("")}
        ${Object.keys(r.add).map(n => `<tr class="rk-add"><th scope="row">${esc(n)}</th><td class="r"><b>${r.add[n]}</b></td></tr>`).join("")}</tbody></table></div>
      <div class="panel"><h3>Antar (${r.antar.length})</h3>${r.antar.length ? Object.keys(areas).sort().map(k => `<h4 class="rk-h">${esc(k)} <span class="muted">${areas[k].length}</span></h4>${areas[k].map(orderCard).join("")}`).join("") : '<p class="note">Tidak ada pesanan antar.</p>'}</div>
      <div class="panel"><h3>Ambil sendiri (${r.ambil.length})</h3>${r.ambil.length ? r.ambil.map(orderCard).join("") : '<p class="note">Tidak ada pesanan ambil sendiri.</p>'}</div>
    </div>` : '<div class="empty">Belum ada pesanan untuk tanggal ini.</div>'}
  </div>`;
}
$("a-rekap").addEventListener("change", e => { if (e.target.id === "rk-po") { rekapPo = e.target.value; renderRekap(); } });
$("a-rekap").addEventListener("click", async e => {
  const b = e.target.closest("[data-rkb]"); if (b) { rekapBasis = b.dataset.rkb; renderRekap(); return; }
  const k = e.target.closest("[data-rk]"); if (!k) return;
  if (k.dataset.rk === "print") window.print();
  else if (k.dataset.rk === "csv") { exportCsv(); toast("File CSV diunduh"); }
  else if (k.dataset.rk === "courier") {
    const r = rekapData(), rpo = r.poSorted.find(p => p.id === rekapPo); if (!rpo || !r.antar.length) { toast("Belum ada pesanan antar."); return; }
    const txt = "Antar " + dLong(rpo.date) + ", jam " + (r.antar[0].hours || hours()) + "\n\n" + r.antar.map((o, i) => `${i + 1}. ${o.nama} (${o.hp})\n${o.area ? o.area + ", " : ""}${o.alamat}\n${mapHref(o)}\n${itemLine(o)}${o.notes ? "\nCatatan: " + o.notes : ""}`).join("\n\n");
    try { await navigator.clipboard.writeText(txt); toast("Daftar antar disalin"); logAct("salin_kurir", rpo.id, r.antar.length + " alamat"); } catch (err) { toast("Tidak bisa menyalin."); }
  }
  else if (k.dataset.rk === "copy") { try { await navigator.clipboard.writeText(rekapText(rekapData())); toast("Rekap disalin"); } catch (err) { toast("Tidak bisa menyalin. Coba cetak atau ekspor."); } }
});

/* --- pelanggan --- */
let custNotes = {}, custOpen = new Set(), custQ = "", custSort = "terbaru";
async function refreshNotes(){ try { const rows = await api.loadNotes(); custNotes = {}; rows.forEach(r => { custNotes[r.hp] = r.note; }); } catch (e) {} if (tab === "cust") renderCust(); }
function customers(){
  const m = {};
  orders.forEach(o => { const k = normPhone(o.hp); const c = m[k] || (m[k] = { key:k, hp:o.hp, nama:o.nama, last:"", first:o.createdAt, os:[], spent:0, n:0 });
    c.os.push(o); if (String(o.createdAt) >= String(c.last)) { c.last = o.createdAt; c.nama = o.nama || c.nama; c.hp = o.hp; } if (String(o.createdAt) < String(c.first)) c.first = o.createdAt;
    if (o.status !== "batal" && o.payStatus !== "ditolak") { c.n++; if (o.payStatus === "lunas") c.spent += o.total; } });
  return Object.values(m);
}
function renderCust(){
  const el = $("a-cust");
  if (ordersState === "loading") { el.innerHTML = '<p class="note">Memuat pelanggan...</p>'; return; }
  const all = customers(), q = custQ.trim().toLowerCase(), d = dg(q);
  let list = all.filter(c => !q || String(c.nama || "").toLowerCase().includes(q) || (d.length >= 3 && dg(c.hp).includes(d)));
  const nRep = all.filter(c => c.n > 1).length;
  if (custFilter === "repeat") list = list.filter(c => c.n > 1);
  list.sort((x, y) => custSort === "terbesar" ? y.spent - x.spent : String(y.last).localeCompare(String(x.last)));
  const rows = list.map(c => { const open = custOpen.has(c.key), note = custNotes[c.key] || "";
    return `<article class="crow ${open ? "open" : ""}" data-ck="${esc(c.key)}">
      <div class="crow-h"><div class="cwho"><b>${esc(c.nama || "Tanpa nama")}</b>${c.n > 1 ? '<span class="otag">Langganan</span>' : ""}${note ? '<span class="otag">Ada catatan</span>' : ""}<small>${esc(c.hp)}</small></div>
        <div class="cstat">${c.spent ? `<b>${rp(c.spent)}</b>` : `<b class="muted">Belum bayar</b>`}<small>${c.n} pesanan, terakhir ${esc(fmtTime(c.last))}</small></div>
        <button class="btn line sm iconbtn" data-ctoggle type="button" aria-expanded="${open}" aria-label="${open ? "Tutup" : "Buka"} detail ${esc(c.nama || "")}">${ic("chevron", open ? "flip" : "")}</button></div>
      ${open ? `<div class="cdetail"><label class="ef full">Catatan pelanggan<textarea data-cnote placeholder="Mis. tidak makan babi, alamat kantor di lantai 9" maxlength="500">${esc(note)}</textarea></label>
        <ul class="chist">${c.os.slice().reverse().slice(0, 12).map(o => { const [sl, sc] = statusChip(o); return `<li><button class="linkbtn mono" data-cgo="${esc(o.id)}" type="button">${esc(o.id)}</button><span>${o.poDate ? esc(dShort(o.poDate)) : ""}</span><span>${rp(o.total)}</span><span class="chip st ${sc}">${sl}</span></li>`; }).join("")}</ul>
        <div class="acts"><a class="btn line sm" href="https://wa.me/${normPhone(c.hp)}" target="_blank" rel="noopener">${ic("chat")}Chat</a><button class="btn line sm" data-cgo="${esc(c.hp)}" type="button">${ic("orders")}Lihat pesanan</button></div></div>` : ""}</article>`; }).join("");
  el.innerHTML = `<div class="toolbar"><label class="osearch">${ic("search")}<input id="c-q" type="search" placeholder="Cari nama atau HP" value="${esc(custQ)}" aria-label="Cari pelanggan" autocomplete="off"></label>
    <div class="stabs" role="group" aria-label="Filter pelanggan"><button type="button" data-cf="semua" aria-pressed="${custFilter === "semua"}">Semua <span class="c">${all.length}</span></button><button type="button" data-cf="repeat" aria-pressed="${custFilter === "repeat"}">Langganan <span class="c">${nRep}</span></button></div>
    <select id="c-sort" class="sel" aria-label="Urutan"><option value="terbaru" ${custSort === "terbaru" ? "selected" : ""}>Terbaru</option><option value="terbesar" ${custSort === "terbesar" ? "selected" : ""}>Belanja terbesar</option></select></div>
    ${rows ? `<div class="clist">${rows}</div>` : '<div class="empty" style="margin-top:16px">Belum ada pelanggan yang cocok.</div>'}`;
}
$("a-cust").addEventListener("input", e => { if (e.target.id !== "c-q") return; custQ = e.target.value; const p = e.target.selectionStart; renderCust(); const i = $("c-q"); if (i) { i.focus(); try { i.setSelectionRange(p, p); } catch (er) {} } });
$("a-cust").addEventListener("change", async e => {
  if (e.target.id === "c-sort") { custSort = e.target.value; renderCust(); return; }
  if (e.target.matches("[data-cnote]")) { const k = e.target.closest("[data-ck]").dataset.ck, v = e.target.value.trim().slice(0, 500); custNotes[k] = v;
    try { await api.saveNote(k, v); logAct("catatan_pelanggan", k, v); toast("Catatan tersimpan"); } catch (er) { toast("Catatan belum tersimpan. Jalankan ulang schema.sql terbaru."); } }
});
$("a-cust").addEventListener("click", e => {
  const cf = e.target.closest("[data-cf]"); if (cf) { custFilter = cf.dataset.cf; renderCust(); return; }
  const t = e.target.closest("[data-ctoggle]"); if (t) { const k = t.closest("[data-ck]").dataset.ck; if (custOpen.has(k)) custOpen.delete(k); else custOpen.add(k); renderCust(); return; }
  const g = e.target.closest("[data-cgo]"); if (g) { oq = g.dataset.cgo; filter = "semua"; setTab("orders"); renderAdminOrders(); }
});

/* --- tab dan navigasi --- */
function renderAdmin(){
  if (view !== "admin" || !isAdmin) return;
  renderAdminOrders();
  if (tab === "sales") renderSales();
  if (tab === "rekap") renderRekap();
  if (tab === "cust") renderCust();
  if (tab === "po") renderPoSafe();
  if (tab === "menu") renderMenuSafe();
  if (tab === "set") renderSetSafe();
}
function setTab(t){
  tab = t;
  document.querySelectorAll("#tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  $("a-orders").hidden = t !== "orders" || newOpen; $("a-new").hidden = !(t === "orders" && newOpen); $("a-sales").hidden = t !== "sales"; $("a-cust").hidden = t !== "cust"; $("a-po").hidden = t !== "po"; $("a-menu").hidden = t !== "menu"; $("a-set").hidden = t !== "set";
  $("a-rekap").hidden = t !== "rekap";
  if (t === "sales") renderSales();
  if (t === "rekap") renderRekap();
  if (t === "cust") renderCust();
  if (t === "po") renderAdminPo();
  if (t === "menu") renderAdminMenu();
  if (t === "set") renderAdminSet();
}
/* jumlah pesanan yang perlu dicek, tampil di sidebar dan di tombol Menu (HP) */
function setCek(n){ lastCek = n; [$("n-cek"), $("n-cek-top")].forEach(b => { b.hidden = !n; b.textContent = n; }); if (view === "admin") document.title = (n ? "(" + n + ") " : "") + "Lapo Doli Admin"; }
/* sidebar: tetap di kiri pada layar lebar, drawer pada HP */
const adminEl = $("admin"), menuBtn = $("menu-btn");
function setSide(open){
  adminEl.classList.toggle("side-open", open); $("side-scrim").hidden = !open; menuBtn.setAttribute("aria-expanded", String(open));
  if (open) { const cur = document.querySelector('#tabs [aria-selected="true"]'); if (cur) cur.focus(); } 
}
menuBtn.onclick = () => setSide(!adminEl.classList.contains("side-open"));
$("side-scrim").onclick = () => { setSide(false); menuBtn.focus(); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && adminEl.classList.contains("side-open")) { setSide(false); menuBtn.focus(); } });
$("tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { setTab(b.dataset.tab); setSide(false); window.scrollTo({ top:0 }); } });

const VIEWS = { shop:"shop", admin:"admin", help:"help-view" };
function setView(v){
  view = v; document.title = v === "admin" ? (lastCek ? "(" + lastCek + ") " : "") + "Lapo Doli Admin" : "Lapo Doli";
  for (const k in VIEWS) $(VIEWS[k]).hidden = k !== v;
  if (v === "admin") {
    $("admin-body").hidden = !isAdmin; $("admin-denied").hidden = isAdmin; adminEl.classList.toggle("authed", isAdmin); setSide(false);
    if (!isAdmin) renderGate();
    renderAdmin();
  }
  try { if (v === "admin") { if (location.hash !== "#admin") location.hash = "admin"; } else if (location.hash === "#admin") location.hash = ""; } catch (e) {}
  window.scrollTo({ top:0 });
}
window.addEventListener("hashchange", () => { const v = location.hash === "#admin" ? "admin" : (view === "admin" ? "shop" : view); if (v !== view) setView(v); });
$("to-admin").onclick = () => setView("admin");
$("to-shop").onclick = $("to-shop-top").onclick = () => setView("shop");
document.querySelectorAll("[data-help]").forEach(b => { b.onclick = () => { setView("help"); if (lastData && lastData.placed && !$("ck-id").value) $("ck-id").value = lastData.placed.map(o => o.id).join(", "); const u = lsGet(LS.cust); if (u && u.hp && !$("ck-hp").value) $("ck-hp").value = u.hp; }; });
$("help-back").onclick = () => setView("shop");
document.querySelectorAll("[data-home]").forEach(l => { l.onclick = e => { e.preventDefault(); closeSheets(); setView("shop"); go(1); }; });

/* ================= LOGIN ADMIN ================= */
function renderGate(){
  const el = $("admin-gate");
  if (!sb) { el.innerHTML = '<div class="empty">Toko belum tersambung ke Supabase. Isi file config.js sesuai README.</div>'; return; }
  if (!authReady) { el.innerHTML = '<p class="note" style="text-align:center">Memeriksa login...</p>'; return; }
  if (session) {
    el.innerHTML = `<div class="card"><h3>Bukan akun admin</h3><p class="fhint">${esc(session.user.email)} belum terdaftar. Minta pemilik toko mendaftarkannya.</p><button class="btn line sm" id="gate-out" type="button" style="margin-top:12px">Keluar</button></div>`;
    $("gate-out").onclick = signOut; return;
  }
  el.innerHTML = `<div class="card"><h3>Masuk admin</h3><p class="fhint" style="margin-top:-6px">Masukkan email admin untuk dapat link masuk.</p>
    <label class="fl" for="gate-email">Email</label><input type="text" id="gate-email" inputmode="email" autocomplete="email" placeholder="nama@email.com">
    <div class="err" id="gate-err"></div><button class="btn" id="gate-send" type="button" style="margin-top:6px">Kirim link masuk</button></div>`;
  $("gate-send").onclick = sendMagic;
  $("gate-email").addEventListener("keydown", e => { if (e.key === "Enter") sendMagic(); });
}
let magicNext = 0;
async function sendMagic(){
  const email = $("gate-email").value.trim(), err = $("gate-err");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Email tidak valid."; return; }
  if (Date.now() < magicNext) { err.textContent = "Tunggu " + Math.ceil((magicNext - Date.now()) / 1000) + " detik sebelum meminta link lagi."; return; }
  err.textContent = ""; $("gate-send").disabled = true;
  /* akun dibuat otomatis saat pertama masuk, tapi database hanya mengizinkan email yang ada di daftar admin (trigger guard_admin_signup) */
  const { error } = await sb.auth.signInWithOtp({ email, options:{ shouldCreateUser:true, emailRedirectTo:location.origin + "/?admin=1" } });
  const m = ((error && (error.code || "")) + " " + (error && error.message || "")).toLowerCase();
  if (error && (error.status === 429 || /rate|too many|over_email/.test(m))) { $("gate-send").disabled = false; magicNext = Date.now() + 60000; err.textContent = "Terlalu sering meminta link. Coba lagi beberapa menit lagi."; return; }
  const unknown = error && /otp_disabled|signups? not allowed|not found|user_not_found|unexpected_failure|database error|saving new user|admin terdaftar/.test(m);
  if (error && !unknown) { $("gate-send").disabled = false; err.textContent = "Link belum terkirim. Periksa koneksi lalu coba lagi."; return; }
  magicNext = Date.now() + 60000;
  /* pesan sama untuk email yang dikenal maupun tidak, supaya daftar admin tidak bisa ditebak */
  $("admin-gate").innerHTML = `<div class="card"><h3>Cek email Anda</h3><p class="fhint" style="margin:0">Kalau ${esc(email)} terdaftar sebagai admin, link masuk sudah dikirim. Cek juga folder spam.</p><button class="btn line sm" id="gate-back" type="button" style="margin-top:12px">Pakai email lain</button></div>`;
  $("gate-back").onclick = renderGate;
}
async function signOut(){ try { await sb.auth.signOut(); } catch (e) {} await applySession(null); }
$("logout").onclick = signOut;
async function applySession(s){
  session = s; let admin = false;
  if (sb && s) { try { admin = await api.isAdmin(); } catch (e) { admin = false; } }
  const was = isAdmin; isAdmin = admin; assetsNs = admin; authReady = true;
  $("foot").hidden = !isAdmin; $("logout").hidden = !session;
  if (isAdmin && !was) startAdmin(); else if (!isAdmin && was) stopAdmin();
  if (view === "admin") setView("admin");
}

/* ================= CEK STATUS PESANAN (halaman Bantuan) ================= */
$("ck-go").onclick = async () => {
  const ids = [...new Set($("ck-id").value.toUpperCase().match(/\d{4}-[A-Z0-9]{2,3}/g) || [])], hp = $("ck-hp").value.trim(), out = $("ck-out");
  $("ck-err").textContent = "";
  if (!ids.length) { $("ck-err").textContent = "Isi nomor pesanan, contoh 1809-03."; return; }
  const m = val.hp(hp); if (m) { $("ck-err").textContent = m; return; }
  if (!sb) { $("ck-err").textContent = "Toko belum siap dipakai. Coba lagi nanti."; return; }
  $("ck-go").disabled = true; out.innerHTML = "";
  try {
    const rows = await api.trackOrders(ids, hp);
    out.innerHTML = rows.length ? rows.map(r => { const [lb, cl] = statusLabel({ fulfil:r.fulfil, payStatus:r.pay_status, status:r.status, proof:!!r.has_proof });
      return `<li><div><b>${esc(r.id)}</b><small>${esc(dShort(r.po_date))} · ${r.fulfil === "ambil" ? "Ambil" : "Antar"} jam ${esc(r.hours)}</small></div><span class="chip ${cl}">${lb}</span></li>`; }).join("")
      : '<li><div class="note">Pesanan tidak ditemukan. Periksa nomor pesanan dan nomor HP yang dipakai saat memesan.</div></li>';
  } catch (e) { $("ck-err").textContent = "Belum bisa memeriksa. Coba lagi sebentar lagi."; }
  $("ck-go").disabled = false;
};

/* ================= MULAI ================= */
let refetchT = {};
const debounced = (name, fn) => { clearTimeout(refetchT[name]); refetchT[name] = setTimeout(fn, 250); };
async function refreshRemaining(){
  try { const m = {}; (await api.loadRemaining() || []).forEach(r => { m[r.po_id + "::" + r.pid] = Number(r.remaining); }); remaining = m; } catch (e) {}
  renderMenu();
}
async function refreshProducts(){
  try { products = await withTimeout(api.loadProducts(), LOAD_MS); dbState = "ok"; saveMenuCache(); }
  catch (e) { if (products === null) dbState = "error"; renderMenu(); return; }
  await refreshRemaining(); if (view === "admin" && tab === "menu") renderMenuSafe();
}
let settingsRaw = null;
function saveMenuCache(){ if (products && pos && dbState === "ok") lsSet(LS.menu, { at:Date.now(), products, pos, settings:settingsRaw }); }
function loadMenuCache(){
  const m = lsGet(LS.menu);
  if (!m || !Array.isArray(m.products) || !Array.isArray(m.pos) || Date.now() - m.at > 7 * 864e5) return;
  products = m.products; pos = m.pos; dbState = "ok";
  if (m.settings) { settingsRaw = m.settings; settings = { ...DEFAULT_SETTINGS, ...m.settings }; settings.qrisUrl = assetUrl(settings.qrisPath); }
}
let posOk = false;   // true setelah jadwal PO berhasil dimuat sekali; sebelum itu keranjang tidak boleh dipangkas
const canPrune = () => dbState === "ok" && posOk;
async function refreshPos(){
  try { pos = await withTimeout(api.loadPos(), LOAD_MS); posOk = true; saveMenuCache(); } catch (e) { if (pos === null) pos = []; }
  renderStatic(); renderMenu(); renderAdmin();
}
function applySettings(d){
  settingsRaw = d; settings = { ...DEFAULT_SETTINGS, ...d }; settings.qrisUrl = assetUrl(settings.qrisPath); saveMenuCache();
  renderStatic(); renderMenu(); renderPayInfo(); if (view === "admin" && tab === "set") renderSetSafe();
}
async function refreshSettings(){ try { applySettings(await withTimeout(api.loadSettings(), LOAD_MS)); } catch (e) {} }
async function refreshOrders(){
  if (!isAdmin) return;
  try { setOrders(await api.loadOrders()); } catch (e) { ordersState = "ok"; renderAdmin(); }
}
let ordersChannel = null;
const SCHEMA_VERSION = 22;
async function checkSchema(){
  let v = 0;
  try { v = Number(must(await sb.rpc("schema_version"))) || 0; } catch (e) { v = 0; }
  $("schema-warn").hidden = v >= SCHEMA_VERSION;
}
function startAdmin(){
  checkSchema(); refreshOrders(); refreshNotes();
  if (!ordersChannel) ordersChannel = sb.channel("lapo-orders").on("postgres_changes", { event:"*", schema:"public", table:"orders" }, () => debounced("orders", refreshOrders)).subscribe();
}
function stopAdmin(){ if (ordersChannel) { sb.removeChannel(ordersChannel); ordersChannel = null; } orders = []; ordersState = "loading"; }
function subscribeRealtime(){
  const ch = sb.channel("lapo-public");
  [["products", refreshProducts], ["pos", refreshPos], ["settings", refreshSettings]].forEach(([t, fn]) => ch.on("postgres_changes", { event:"*", schema:"public", table:t }, () => debounced(t, fn)));
  ch.subscribe();
}
async function init(){
  restoreState(); initLast(); loadMenuCache(); renderStatic();
  ["nama", "hp", "alamat"].forEach(k => $(k).addEventListener("input", saveCust)); $("area").addEventListener("change", saveCust);
  renderMenu(); updateBar(); go(1);
  setInterval(checkClosings, 15000); document.addEventListener("visibilitychange", checkClosings);
  const q = new URLSearchParams(location.search), hasTokens = /access_token|refresh_token|error_description/.test(location.hash);
  const wantAdmin = location.hash === "#admin" || !!q.get("admin");
  if (wantAdmin && !hasTokens) setView("admin");
  /* tautan status: /?cek=2511-09 membuka Bantuan dengan nomor pesanan terisi (dan langsung memeriksa bila nomor HP sudah tersimpan) */
  const cek = q.get("cek");
  if (cek && !wantAdmin) {
    setView("help"); $("ck-id").value = cek; const u = lsGet(LS.cust); if (u && u.hp) $("ck-hp").value = u.hp;
    history.replaceState(null, "", location.pathname); track("buka_tautan_status");
    if (u && u.hp && !val.hp(u.hp)) setTimeout(() => $("ck-go").click(), 1200);
  }
  if (!sb) { dbState = "none"; renderMenu(); renderPayInfo(); authReady = true; if (view === "admin") setView("admin"); return; }
  await Promise.all([refreshProducts(), refreshPos(), refreshSettings()]);
  subscribeRealtime();
  const { data } = await sb.auth.getSession();
  await applySession(data.session);
  sb.auth.onAuthStateChange((ev, s) => { setTimeout(() => applySession(s), 0); });
  if (wantAdmin) { history.replaceState(null, "", location.pathname + "#admin"); setView("admin"); }
  setInterval(() => { if (document.hidden) return; refreshProducts(); refreshPos(); refreshSettings(); if (isAdmin) refreshOrders(); }, 45000);
}
init();

/* foto gagal dimuat: ganti dengan ubin emoji supaya tidak ada kotak rusak */
document.addEventListener("error", e => {
  const im = e.target; if (!im || im.tagName !== "IMG" || !im.classList.contains("thumb") || im.dataset.fallback == null) return;
  const d = document.createElement("div"); d.className = "thumb tile" + (im.classList.contains("lthumb") ? " lthumb" : ""); d.setAttribute("aria-hidden", "true"); d.textContent = im.dataset.fallback; im.replaceWith(d);
}, true);
