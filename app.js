const $ = id => document.getElementById(id);
const ic = (n, c = "") => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rp = n => "Rp " + (Number(n) || 0).toLocaleString("id-ID");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let toastT;
function toast(msg){ const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

/* Tanggal PO disimpan sebagai teks YYYY-MM-DD dan ditampilkan tanpa geser zona waktu. */
const dparse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const fmtD = (s, o) => { const d = dparse(s); return d ? new Intl.DateTimeFormat("id-ID", { timeZone:"UTC", ...o }).format(d) : ""; };
const dLong = s => fmtD(s, { weekday:"long", day:"numeric", month:"long", year:"numeric" });
const dShort = s => fmtD(s, { weekday:"short", day:"numeric", month:"short" });
const codeOf = s => String(s).slice(8, 10) + String(s).slice(5, 7);   // 2026-09-18 -> 1809

/* Contoh data. Dipakai kalau database belum tersedia, dan untuk "Isi menu awal". */
const NASI = { id:"nasi", name:"Nasi", price:5000 }, SOP = { id:"sop", name:"Sop", price:0 };
const DEFAULT_PRODUCTS = [
  { id:"kecap",     name:"Babi Kecap",        desc:"Babi empuk dimasak manis gurih dengan kecap dan bumbu rempah.", price:35000, emoji:"🍖", available:true, sort:1, options:["250ml=35000", "500ml=70000"], addons:[NASI, SOP], image:"/assets/menu/babi-kecap.svg", imageUrl:"/assets/menu/babi-kecap.svg" },
  { id:"saksang",   name:"Babi Saksang",      desc:"Khas Batak, bumbu andaliman dan rempah pekat, pedas harum.",    price:40000, emoji:"🥘", available:true, sort:2, options:["Pakai gota", "Tidak pakai gota"], addons:[NASI, SOP], image:"/assets/menu/babi-saksang.svg", imageUrl:"/assets/menu/babi-saksang.svg" },
  { id:"teri",      name:"Teri Medan Balado", desc:"Teri Medan renyah dengan sambal balado pedas.",                  price:25000, emoji:"🌶️", available:true, sort:3, options:["250ml=25000", "500ml=50000"], addons:[NASI], image:"/assets/menu/teri-medan-balado.svg", imageUrl:"/assets/menu/teri-medan-balado.svg" },
  { id:"napinadar", name:"Ayam Napinadar",    desc:"Ayam khas Batak Toba berbumbu andaliman, pedas dan harum.",      price:40000, emoji:"🍗", available:true, sort:4, options:["250ml - Pakai gota=40000", "250ml - Tidak pakai gota=40000", "500ml - Pakai gota=75000", "500ml - Tidak pakai gota=75000"], addons:[NASI], image:"/assets/menu/ayam-napinadar.svg", imageUrl:"/assets/menu/ayam-napinadar.svg" }
];
const DEFAULT_POS = [{ id:"po-20260918", date:"2026-09-18", open:true }, { id:"po-20260925", date:"2026-09-25", open:true }, { id:"po-20261001", date:"2026-10-01", open:true }];
const DEFAULT_SETTINGS = { waNumber:"6281375205386", bankName:"Seabank", bankNumber:"901912654821", bankHolder:"a.n. Ricky Halomoan", ongkir:10000, qrisPath:"", qrisUrl:"", deliveryHours:"12.00 - 14.00", pickupHours:"12.00 - 14.00", pickupLocation:"Bassura City Mall, Lobi Selatan", poCutoff:"10:00" };

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
  options:(r.options || []).map(o => o.price != null ? `${o.name}=${o.price}` : o.name), addons:r.addons || [], image:r.image, imageUrl:assetUrl(r.image) });
const toProductRow = patch => {
  const m = {};
  for (const k in patch) { const v = patch[k];
    if (k === "desc") m.description = v; else if (k === "options") m.options = parseOptions(v);
    else if (["name", "price", "emoji", "available", "sort", "addons", "image", "quota"].includes(k)) m[k] = v; }
  return m;
};
const fromOrder = r => ({ id:r.id, gid:r.gid, poId:r.po_id, poDate:r.po_date, createdAt:r.created_at, source:r.source, nama:r.nama, hp:r.hp,
  area:r.area, alamat:r.alamat, fulfil:r.fulfil, pickupLoc:r.pickup_loc, notes:r.notes, method:r.method, items:Array.isArray(r.items) ? r.items : [],
  ongkir:r.ongkir, total:r.total, kode:Number(r.kode) || 0, groupTotal:r.group_total, groupCount:r.group_count, hours:r.hours, payStatus:r.pay_status, status:r.status });
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
  deleteProduct: async id => must(await sb.from("products").delete().eq("id", id)),
  uploadImage: async blob => {
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg", path = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    must(await sb.storage.from("menu").upload(path, blob, { contentType:blob.type || "image/jpeg", cacheControl:"31536000" })); return path;
  },
  addPo: async date => must(await sb.from("pos").insert({ id:"po-" + date.replace(/-/g, ""), date, open:true })),
  setPoOpen: async (id, open) => must(await sb.from("pos").update({ open }).eq("id", id)),
  deletePo: async id => must(await sb.from("pos").delete().eq("id", id)),
  saveSettings: async data => must(await sb.from("settings").upsert({ id:"shop", data })),
  setOrder: async (id, p) => must(await sb.from("orders").update({ pay_status:p.payStatus, status:p.status }).eq("id", id)),
  createOrders: async (payload, asAdmin) => must(await sb.rpc("create_orders", { payload, as_admin:!!asAdmin })),
  loadRemaining: async () => must(await sb.rpc("po_remaining")),
  trackOrders: async (ids, phone) => must(await sb.rpc("track_orders", { ids, phone }))
};
let remaining = {};                // sisa kuota: "poId::pid" -> angka (hanya menu yang punya kuota)
const remainOf = (poId, pid) => Object.prototype.hasOwnProperty.call(remaining, poId + "::" + pid) ? remaining[poId + "::" + pid] : null;
const serverClosed = new Set();   // tanggal PO yang ditolak server (jam server lebih akurat dari jam perangkat)

let products = null, pos = null;   // null sampai data pertama dimuat
let settings = { ...DEFAULT_SETTINGS };
let view = "shop";
const cart = {};                   // kunci: poId::produk, poId::produk::indeksVarian, atau poId::produk::+idAddon
let activePo = null, menuShown = false, fulfil = "antar";
let placed = [], recorded = false, trackConf = {};

const shopList = () => dbState === "none" ? DEFAULT_PRODUCTS : products;
const poList = () => dbState === "none" ? DEFAULT_POS : pos;
/* PO ditutup otomatis pada hari H pukul 10.00 WIB (jam bisa diubah di Pengaturan). */
const cutoffTime = () => /^\d{1,2}[:.]\d{2}$/.test(settings.poCutoff || "") ? settings.poCutoff.replace(".", ":").padStart(5, "0") : "10:00";
const cutoffLabel = () => cutoffTime().replace(":", ".");
const cutoffAt = po => Date.parse(`${po.date}T${cutoffTime()}:00+07:00`);
const isPast = po => Date.now() >= cutoffAt(po);
const poOpenNow = po => po.open === true && !isPast(po) && !serverClosed.has(po.date);
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
function pickedText(poId, pid){
  const p = (shopList() || []).find(x => x.id === pid); if (!p) return "";
  const parts = [];
  optsOf(p).forEach((o, j) => { const q = cart[`${poId}::${pid}::${j}`]; if (q) parts.push(`${o.name} × ${q}`); });
  addonsOf(p).forEach(a => { const q = cart[addonKey(poId, pid, a.id)]; if (q) parts.push(`${a.name} × ${q}`); });
  return parts.join(" · ");
}
const fromPrice = p => { const o = optsOf(p); return o.length ? Math.min(...o.map(x => x.price)) : Number(p.price) || 0; };
const addonsOf = p => Array.isArray(p.addons) ? p.addons.filter(a => a && a.id && a.name) : [];
const addonKey = (poId, pid, aid) => `${poId}::${pid}::+${aid}`;
const isAddonKey = k => (k.split("::")[2] || "").startsWith("+");
const parseAddons = s => s.split(",").map(x => x.trim()).filter(Boolean).map(x => {
  const [n, pr] = x.split("="), name = (n || "").trim();
  return { id:name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, price:Math.max(0, Math.round(Number(String(pr || "0").replace(/\D/g, "")) || 0)) };
}).filter(a => a.id && a.name);
const fmtAddons = p => addonsOf(p).map(a => `${a.name}=${a.price}`).join(", ");
const fmtWa = n => { const d = String(n).replace(/\D/g, ""); return d.startsWith("62") && d.length >= 11 ? `+62 ${d.slice(2, 5)}-${d.slice(5, 9)}-${d.slice(9)}` : "+" + d; };
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
  if (poList() === null) { el.innerHTML = ""; $("poinfo").textContent = "Memuat jadwal PO..."; return; }
  if (!list.length) { el.innerHTML = ""; $("poinfo").textContent = ""; return; }
  if (!list.some(x => x.id === activePo)) activePo = list[0].id;
  el.innerHTML = list.map(po => { const n = countFor(po.id);
    return `<button type="button" class="cbtn" data-po="${esc(po.id)}" aria-pressed="${po.id === activePo}"><span class="dow">${esc(fmtD(po.date, { weekday:"short" }))}</span><span class="dnum">${esc(fmtD(po.date, { day:"numeric" }))}</span><span class="mon">${esc(fmtD(po.date, { month:"short" }))}</span>${n ? `<span class="cnt" aria-label="${n} porsi dipilih">${n}</span>` : ""}</button>`; }).join("");
  const act = list.find(x => x.id === activePo);
  $("poinfo").textContent = (hours() === pickHours() ? `Antar di Jakarta atau ambil sendiri, jam ${hours()}.` : `Antar di Jakarta jam ${hours()}, ambil sendiri jam ${pickHours()}.`) + ` Pesan paling lambat pukul ${cutoffLabel()} hari itu.` + (list.length > 1 ? " Boleh pilih lebih dari satu tanggal." : "");
}
$("pochips").addEventListener("click", e => {
  const b = e.target.closest("[data-po]"); if (!b) return;
  activePo = b.dataset.po; renderMenu();
});

function renderMenu(){
  const el = $("menu"), list = shopList(), pl = openPos();
  renderPoChips();
  if (dbState === "error") { el.innerHTML = '<div class="empty">Menu belum bisa dimuat. Periksa koneksi lalu muat ulang halaman.</div>'; $("closed").hidden = true; $("po-wrap").hidden = false; updateBar(); return; }
  if (!list || poList() === null) { el.innerHTML = '<p class="note">Memuat menu...</p>'; $("closed").hidden = true; updateBar(); return; }
  for (const k of Object.keys(cart)) if (!resolveKey(k, list)) delete cart[k];
  $("closed").hidden = pl.length > 0; $("po-wrap").hidden = pl.length === 0;
  if (!pl.length) { updateBar(); return; }
  if (!list.length) { el.innerHTML = '<div class="empty">Menu belum tersedia. Silakan cek lagi nanti.</div>'; updateBar(); return; }
  const act = pl.find(x => x.id === activePo) || pl[0];
  el.innerHTML = list.map((p, i) => {
    const opts = optsOf(p), adds = addonsOf(p), k = act.id + "::" + p.id, img = imgSrc(p), rem = remainOf(act.id, p.id), off = p.available === false || rem === 0, showP = opts.some(o => o.custom);
    const thumb = img ? `<img class="thumb" src="${esc(img)}" alt="${esc(p.name)}">` : `<div class="thumb tile" aria-hidden="true">${esc(p.emoji || "🍽️")}</div>`;
    const ctl = off ? '<span class="soldout">Habis</span>' : opts.length ? '<button type="button" class="pickbtn" data-pick aria-expanded="false">Pilih</button>' : stepper(k, p.name);
    const addsHTML = !off && adds.length ? `<div class="subs adds" data-po="${esc(act.id)}" data-pid="${esc(p.id)}" hidden><div class="subs-title">Tambahan</div>${adds.map(a => { const ak = addonKey(act.id, p.id, a.id);
      return `<div class="sub"><span>${esc(a.name)}<em>${a.price ? "+" + rp(a.price) : "gratis"}</em></span>${stepper(ak, a.name + " untuk " + p.name, (cart[ak] || 0) >= mainQty(act.id, p.id))}</div>`; }).join("")}</div>` : "";
    const panel = !off && opts.length ? `<div class="vpanel">${variantsHTML(p, k, stepper)}${addsHTML}</div>` : addsHTML;
    return `<div class="item ${off ? "off" : ""}" data-pid="${esc(p.id)}" data-po="${esc(act.id)}" style="--i:${i}">
      <div class="ihead">${thumb}<div class="ibody"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><div class="ifoot"><span class="pricebox"><span class="price">${showP ? "Mulai " + rp(fromPrice(p)) : rp(p.price)}</span>${rem != null && rem > 0 && rem <= 10 ? `<span class="left">Sisa ${rem}</span>` : ""}</span>${ctl}</div></div></div>
      ${opts.length && !off ? '<div class="picked" hidden></div>' : ""}${panel}${off ? "" : `<div class="noterow" hidden><input type="text" class="inote" data-note maxlength="120" placeholder="Catatan untuk ${esc(p.name)}, contoh: tidak pakai cabai" aria-label="Catatan untuk ${esc(p.name)}" value="${esc(itemNotes[act.id + "::" + p.id] || "")}"></div>`}</div>`;
  }).join("");
  syncMenuDom();
  if (!menuShown) { menuShown = true; el.classList.add("enter"); setTimeout(() => el.classList.remove("enter"), 1000); }
  updateBar();
}
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
    const sel = pickedText(po, pid), pk = it.querySelector(".picked");
    it.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "Tutup" : sel ? "Ubah" : "Pilih";
    if (pk) { pk.textContent = sel ? "Dipilih: " + sel : ""; pk.hidden = open || !sel; }
  });
}
$("menu").addEventListener("click", e => {
  const pb = e.target.closest("[data-pick]");
  if (pb) { const it = pb.closest(".item"), id = it.dataset.po + "::" + it.dataset.pid; if (openItems.has(id)) openItems.delete(id); else openItems.add(id); syncMenuDom(); return; }
  const b = e.target.closest("button[data-d]"); if (!b) return;
  const key = b.closest("[data-key]").dataset.key, [poId, pid] = key.split("::");
  const rem = isAddonKey(key) ? null : remainOf(poId, pid);
  if (Number(b.dataset.d) > 0 && rem != null && mainQty(poId, pid) >= rem) { toast("Sisa " + rem + " porsi untuk menu ini"); return; }
  cart[key] = Math.max(0, (cart[key] || 0) + Number(b.dataset.d));
  if (!cart[key]) delete cart[key];
  if (!isAddonKey(key)) clampAddons(poId, pid);
  syncMenuDom(); renderPoChips(); updateBar();
});

const itemNotes = {};
$("menu").addEventListener("input", e => {
  if (!e.target.matches("[data-note]")) return;
  const it = e.target.closest(".item"); itemNotes[it.dataset.po + "::" + it.dataset.pid] = e.target.value;
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
function updateBar(){
  const gs = groups();
  $("count").textContent = qtyTotal() + " porsi" + (gs.length > 1 ? " · " + gs.length + " tanggal" : "");
  $("subtotal").textContent = rp(gs.reduce((a, g) => a + g.food, 0));
  $("next").disabled = qtyTotal() === 0;
  document.querySelectorAll("[data-hours]").forEach(x => { x.textContent = hours(); });
  document.querySelectorAll("[data-ongkir]").forEach(x => { x.textContent = flat() ? rp(flat()) : "gratis"; });
  document.querySelectorAll("[data-pickloc]").forEach(x => { x.textContent = pickLoc(); });
  document.querySelectorAll("[data-pickhours]").forEach(x => { x.textContent = pickHours(); });
  document.querySelectorAll("[data-wa]").forEach(x => { x.textContent = fmtWa(settings.waNumber); });
  document.querySelectorAll("[data-cutoff]").forEach(x => { x.textContent = cutoffLabel(); });
  $("closed-wa").href = `https://wa.me/${settings.waNumber}?text=${encodeURIComponent("Halo admin Lapo Doli, kapan PO berikutnya dibuka?")}`;
  const noPo = screen === 1 && poList() !== null && openPos().length === 0;
  $("bar").hidden = screen !== 1 || noPo; $("shop").classList.toggle("no-po", noPo);
  $("help-wa").href = `https://wa.me/${settings.waNumber}?text=${encodeURIComponent("Halo admin Lapo Doli, saya mau tanya soal pesanan.")}`;
}
function summaryHTML(gs){
  const h = gs.map(g => `<div class="gh">${g.fulfil === "ambil" ? "Ambil" : "Antar"} ${esc(dLong(g.date))}, jam ${esc(hoursFor(g.fulfil))}</div>` +
    g.items.map(l => `<div><span>${l.qty} × ${esc(l.name)}${l.option ? " (" + esc(l.option) + ")" : ""}</span><span>${l.price ? rp(l.price * l.qty) : "Gratis"}</span></div>${l.note ? `<div class="lnote">Catatan: ${esc(l.note)}</div>` : ""}`).join("") +
    (g.ongkir ? `<div><span>Ongkir Lalamove</span><span>${rp(g.ongkir)}</span></div>` : g.fulfil === "ambil" ? "<div><span>Ambil sendiri</span><span>Tanpa ongkir</span></div>" : "")).join("");
  return h + `<div class="total"><span>Total</span><span>${rp(grand(gs))}</span></div>`;
}

/* --- layar: 1 pesan, 2 checkout, 3 selesai --- */
let screen = 1, openSig = "";
function pruneClosed(){
  const ids = new Set(openPos().map(p => p.id)), gone = new Set();
  Object.keys(cart).forEach(k => { const pid = k.split("::")[0]; if (!ids.has(pid)) { gone.add(pid); delete cart[k]; } });
  return [...gone].map(id => { const po = (poList() || []).find(x => x.id === id); return po ? dShort(po.date) : id; });
}
function checkClosings(){
  if (poList() === null) return;
  const gone = pruneClosed(), sig = openPos().map(p => p.id).join();
  if (!gone.length && sig === openSig) return;
  openSig = sig; renderMenu();
  if (gone.length) { toast("PO " + gone.join(", ") + " sudah ditutup dan dihapus dari pesanan Anda"); if (screen === 2) { if (qtyTotal()) renderCheckout(); else go(1); } }
}
function go(n){
  screen = n;
  document.querySelectorAll("#shop section").forEach((s, i) => s.classList.toggle("show", i + 1 === n));
  $("bar").hidden = n !== 1; $("shop").classList.toggle("has-bar", n === 1); $("shop").classList.toggle("home", n === 1);
  if (n === 2) renderCheckout();
  window.scrollTo({ top:0 });
}
$("next").onclick = () => go(2);
$("back1").onclick = () => go(1);

/* Kode unik 1-999 ditambahkan ke jumlah bayar supaya admin mudah mencocokkan mutasi bank. Tetap sama selama pembeli di halaman ini. */
let payCode = 0;
const codeOn = () => settings.uniqueCode !== false;
function renderCheckout(){
  const gs2 = groups();
  if (!codeOn()) payCode = 0; else if (!payCode) payCode = 1 + Math.floor(Math.random() * 999);
  $("sum2").innerHTML = summaryHTML(gs2); $("pay-total").textContent = rp(grand(gs2) + payCode);
  const cn = $("pay-code-note"); cn.hidden = !payCode;
  if (payCode) cn.textContent = "Sudah termasuk kode unik " + rp(payCode) + " supaya pembayaran Anda mudah dicek. Transfer tepat sesuai angka ini.";
  $("addr-fields").hidden = isPick(); $("pick-box").hidden = !isPick();
  $("pick-loc").textContent = pickLoc(); $("pick-hours").textContent = pickHours();
  renderPayInfo();
}
document.querySelectorAll("[name=fulfil]").forEach(r => r.onchange = () => { fulfil = document.querySelector("[name=fulfil]:checked").value; renderCheckout(); });
function renderPayInfo(){
  $("bank-name").textContent = settings.bankName;
  $("bank-no").textContent = settings.bankNumber;
  $("bank-holder").textContent = settings.bankHolder;
  const hasQ = !!settings.qrisUrl;
  $("qris-opt").hidden = !hasQ;
  $("qris-box").innerHTML = hasQ ? `<img src="${esc(settings.qrisUrl)}" alt="QRIS Lapo Doli">` : "";
  if (!hasQ) document.querySelector("[name=pay][value=transfer]").checked = true;
  syncPay();
}
function syncPay(){
  const m = document.querySelector("[name=pay]:checked").value;
  $("pi-transfer").classList.toggle("show", m === "transfer");
  $("pi-qris").classList.toggle("show", m === "qris");
}
document.querySelectorAll("[name=pay]").forEach(r => r.onchange = syncPay);
$("copy-no").onclick = async () => {
  try { await navigator.clipboard.writeText(settings.bankNumber); toast("Nomor rekening disalin"); }
  catch (e) { toast("Salin manual dari nomor di atas"); }
};

const val = {
  nama:   v => v.trim().length >= 2 ? "" : "Isi nama Anda.",
  hp:     v => /^(\+?62|0)8\d{7,12}$/.test(v.replace(/[\s-]/g, "")) ? "" : "Nomor HP tidak valid. Contoh: 08123456789",
  area:   v => AREAS.includes(v) ? "" : "Pilih wilayah di Jakarta.",
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
  if (/menu_unavailable/.test(m)) { toast("Ada menu yang sudah habis. Muat ulang halaman lalu pilih lagi."); refreshProducts(); return; }
  if (/rate_limited/.test(m)) { toast("Terlalu banyak pesanan dari nomor ini. Tunggu 10 menit lalu coba lagi."); return; }
  if (/invalid_hp/.test(m)) { toast("Nomor HP tidak valid."); return; }
  if (/invalid_(area|alamat)/.test(m)) { toast("Wilayah atau alamat belum benar."); return; }
  toast("Pesanan belum terkirim. Periksa koneksi lalu coba lagi.");
}
const linePayload = i => ({ pid:i.pid, ...(i.addon ? { addon:i.addonId } : i.optIdx != null ? { opt:i.optIdx } : {}), qty:i.qty, note:i.note || "" });

async function submitOrder(){
  const gone = pruneClosed();
  if (gone.length) { toast("PO " + gone.join(", ") + " sudah ditutup dan dihapus dari pesanan Anda"); renderMenu(); if (qtyTotal()) renderCheckout(); else go(1); return; }
  let ok = true;
  const chk = (k, m) => { $("e-" + k).textContent = m; if (m) ok = false; };
  chk("nama", val.nama($("nama").value)); chk("hp", val.hp($("hp").value));
  if (isPick()) { chk("area", ""); chk("alamat", ""); } else { chk("area", val.area($("area").value)); chk("alamat", val.alamat($("alamat").value)); }
  if (!ok) { const f = [...document.querySelectorAll("#s2 .err")].find(x => x.textContent && !x.closest("[hidden]")); if (f) f.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
  if (!sb) { toast("Toko belum tersambung ke database."); return; }
  const btn = $("paid"); btn.disabled = true;
  const method = document.querySelector("[name=pay]:checked").value, gs = groups();
  const customer = { kode:payCode, nama:$("nama").value.trim(), hp:$("hp").value.trim(), fulfil, area:isPick() ? "" : $("area").value, alamat:isPick() ? "" : $("alamat").value.trim(), notes:$("notes").value.trim(), method };
  let res;
  try { res = await api.createOrders({ ...customer, groups:gs.map(g => ({ po_id:g.poId, lines:g.items.map(linePayload) })) }); }
  catch (e) { btn.disabled = false; orderFailed(e); return; }
  btn.disabled = false;
  placed = res.map(r => ({ id:r.id, gid:r.gid, poId:r.po_id, poDate:r.po_date, fulfil:r.fulfil, hours:r.hours, pickupLoc:r.pickup_loc, total:r.total, items:r.items, ...customer }));
  recorded = true; trackHp = customer.hp;
  const outGs = res.map(r => ({ poId:r.po_id, date:r.po_date, fulfil:r.fulfil, items:r.items, ongkir:r.total - r.items.reduce((a, i) => a + i.price * i.qty, 0), total:r.total }));
  const kodeSum = res.reduce((a, r) => a + (Number(r.kode) || 0), 0), total = grand(outGs) + kodeSum, nums = placed.map(o => o.id).join(", ");
  payCode = 0;
  const msg =
`Halo Lapo Doli, saya sudah bayar.

No. Pesanan: ${nums}
Nama: ${customer.nama}
HP: ${customer.hp}
${isPick() ? "Ambil sendiri di " + pickLoc() : "Wilayah: " + customer.area + "\nAlamat: " + customer.alamat}
${customer.notes ? "Catatan: " + customer.notes + "\n" : ""}
${outGs.map((g, i) => `${placed[i].id} · ${isPick() ? "Ambil" : "Antar"} ${dLong(g.date)}, jam ${placed[i].hours}:\n${g.items.map(x => `- ${x.qty} × ${x.name}${x.option ? " (" + x.option + ")" : ""}${x.note ? "\n  Catatan: " + x.note : ""}`).join("\n")}${isPick() ? "" : "\nOngkir: " + rp(g.ongkir)}`).join("\n\n")}

Total: ${rp(total)}${kodeSum ? " (termasuk kode unik " + rp(kodeSum) + ")" : ""}
Bayar via: ${method === "qris" ? "QRIS" : "Transfer " + settings.bankName}

(Bukti bayar saya lampirkan di chat ini)`;
  $("wa").href = `https://wa.me/${settings.waNumber}?text=${encodeURIComponent(msg)}`;
  $("sum3").innerHTML = summaryHTML(outGs);
  unsubTrack(); renderTracker(); startTrack();
  go(3);
}
$("paid").onclick = submitOrder;
["nama", "hp", "area", "alamat"].forEach(k => { $(k).addEventListener("input", () => { $("e-" + k).textContent = ""; }); });
/* Status pesanan di layar selesai diperbarui tiap 8 detik. */
let trackT = null, trackHp = "";
const unsubTrack = () => { clearInterval(trackT); trackT = null; trackConf = {}; };
async function pollTrack(){
  if (!placed.length || !sb) return;
  try { const rows = await api.trackOrders(placed.map(o => o.id), trackHp); rows.forEach(r => { trackConf[r.id] = { payStatus:r.pay_status, status:r.status }; }); renderTracker(); } catch (e) {}
}
function startTrack(){ pollTrack(); trackT = setInterval(() => { if (screen === 3 && !document.hidden) pollTrack(); }, 8000); }

const DLV = { baru:["Terkonfirmasi", "ok"], diproses:["Sedang diproses", "info"], diantar:["Dalam pengiriman", "info"], selesai:["Terkirim", "ok"] };
const DLV_PICK = { baru:["Terkonfirmasi", "ok"], diproses:["Sedang diproses", "info"], diantar:["Siap diambil", "info"], selesai:["Sudah diambil", "ok"] };
function statusLabel(o){
  if (o.status === "batal") return ["Dibatalkan", ""];
  if (o.payStatus === "ditolak") return ["Bayar ditolak", "bad"];
  if (o.payStatus !== "lunas") return ["Menunggu cek bayar", "warn"];
  return (o.fulfil === "ambil" ? DLV_PICK : DLV)[o.status] || DLV.baru;
}
function renderTracker(){
  const tr = $("track");
  const cs = placed.map(o => trackConf[o.id] || { payStatus:"cek", status:"baru" });
  const allCancel = cs.length && cs.every(c => c.status === "batal"), anyNo = cs.some(c => c.payStatus === "ditolak");
  const allPaid = cs.every(c => c.payStatus === "lunas"), allDone = cs.every(c => c.status === "selesai" || c.status === "batal");
  const pk = placed[0] && placed[0].fulfil === "ambil";
  let title, sub, tone = "warn";
  if (!recorded) { title = "Pesanan dibuat"; sub = "Pesanan belum tercatat otomatis. Kirim lewat WhatsApp sekarang supaya kami proses."; }
  else if (allCancel) { title = "Pesanan dibatalkan"; sub = "Hubungi admin lewat WhatsApp kalau ini keliru."; tone = "bad"; }
  else if (anyNo) { title = "Pembayaran belum cocok"; sub = "Admin belum menemukan pembayaran Anda. Kirim bukti bayar lewat WhatsApp."; tone = "bad"; }
  else if (!allPaid) { title = "Pesanan diterima"; sub = "Kirim bukti bayar ke admin lewat WhatsApp. Pesanan terkonfirmasi setelah admin mengecek pembayaran."; }
  else if (allDone) { title = "Pesanan selesai"; sub = "Terima kasih, selamat makan!"; tone = "ok"; }
  else { title = "Pesanan terkonfirmasi"; sub = pk ? `Pembayaran sudah diterima. Ambil di ${placed[0].pickupLoc || pickLoc()} sesuai tanggal PO, jam ${placed[0].hours || pickHours()}.` : `Pembayaran sudah diterima. Pesanan diantar sesuai tanggal PO, jam ${hours()}.`; tone = "ok"; }
  $("d-title").textContent = title; $("d-sub").textContent = sub; $("d-dot").className = "dot " + (tone === "warn" ? "" : tone);
  tr.innerHTML = placed.map((o, i) => {
    const c = cs[i], [lb, cl] = statusLabel({ fulfil:o.fulfil, payStatus:c.payStatus, status:c.status });
    return `<li><div><b>${esc(o.id)}</b><small>${esc(dShort(o.poDate))} · ${o.fulfil === "ambil" ? "Ambil" : "Antar"} jam ${esc(o.hours || hours())}</small></div><span class="chip ${cl}">${lb}</span></li>`;
  }).join("");
}
$("again").onclick = () => {
  for (const k in cart) delete cart[k];
  for (const k in itemNotes) delete itemNotes[k];
  unsubTrack(); placed = [];
  ["nama", "hp", "alamat", "notes"].forEach(i => { $(i).value = ""; }); $("area").value = "";
  renderMenu(); go(1);
};

/* ================= ADMIN ================= */
const NEXT = { baru:"diproses", diproses:"diantar", diantar:"selesai" };
const nextLabel = o => (o.fulfil === "ambil" ? { baru:"Mulai proses", diproses:"Tandai siap diambil", diantar:"Tandai sudah diambil" } : { baru:"Mulai proses", diproses:"Tandai sudah dikirim", diantar:"Tandai sudah sampai" })[o.status];
function statusChip(o){
  if (o.status === "batal") return ["Dibatalkan", ""];
  if (o.payStatus === "ditolak") return ["Bayar ditolak", "bad"];
  if (o.payStatus !== "lunas") return ["Menunggu cek bayar", "warn"];
  const pk = o.fulfil === "ambil";
  return ({ baru:["Siap diproses", "info"], diproses:["Sedang diproses", "info"], diantar:[pk ? "Siap diambil" : "Dalam pengiriman", "info"], selesai:[pk ? "Sudah diambil" : "Terkirim", "ok"] })[o.status] || ["Siap diproses", "info"];
}
function primaryAct(o){
  if (o.status === "batal") return ["reopen", "Buka lagi", "line"];
  if (o.payStatus !== "lunas") return ["pay_ok", "Konfirmasi bayar", ""];
  if (NEXT[o.status]) return ["next", nextLabel(o), ""];
  return null;
}
let orders = [], ordersState = "loading", filter = null, poFilter = "semua", tab = "orders";
const busy = new Set(), expanded = new Set(); let armCancel = null, armDel = null, armPoDel = null;

function setOrders(rows){
  orders = rows.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  ordersState = "ok";
  renderAdmin();
}
const FILTERS = [
  ["cek", "Dicek", o => o.payStatus === "cek" && o.status !== "batal"],
  ["siap", "Proses", o => o.payStatus === "lunas" && (o.status === "baru" || o.status === "diproses")],
  ["kirim", "Kirim", o => o.payStatus === "lunas" && o.status === "diantar"],
  ["selesai", "Selesai", o => o.status === "selesai"],
  ["batal", "Batal", o => o.status === "batal" || o.payStatus === "ditolak"],
  ["semua", "Semua", () => true]
];
const EMPTY = { cek:"Semua pembayaran sudah dicek.", siap:"Tidak ada pesanan yang menunggu diproses.", kirim:"Tidak ada pesanan yang sedang dikirim atau siap diambil.", selesai:"Belum ada pesanan selesai.", batal:"Tidak ada pesanan batal atau ditolak.", semua:"Belum ada pesanan. Pesanan baru muncul di sini otomatis." };
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? "" : new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(d); };

function orderRow(o){
  const [sl, sc] = statusChip(o), pa = primaryAct(o), open = expanded.has(o.id);
  const dis = busy.has(o.id) ? "disabled" : "", grp = Number(o.groupCount) > 1, pk = o.fulfil === "ambil";
  const wa = `https://wa.me/${normPhone(o.hp)}?text=${encodeURIComponent(`Halo kak ${o.nama || ""}, soal pesanan ${o.id} dari Lapo Doli: `)}`;
  const main = o.items.filter(i => !i.addon), adds = o.items.filter(i => i.addon), hasNote = !!o.notes || o.items.some(i => i.note);
  const summary = main.map(i => `${Number(i.qty) || 0}× ${i.name}${i.option ? " (" + i.option + ")" : ""}`).join(" · ") + (adds.length ? ` · +${adds.reduce((a, i) => a + (Number(i.qty) || 0), 0)} tambahan` : "");
  const meta = [pk ? "Ambil sendiri" : "Antar" + (o.area ? " · " + o.area : ""), rp(o.total), o.method === "qris" ? "QRIS" : "Transfer"].concat(grp ? ["Gabungan " + o.groupCount + " tanggal"] : []).join(" · ");
  const gk = orders.filter(x => x.gid === o.gid).reduce((t, x) => t + (x.kode || 0), 0);
  let sec = "";
  if (o.status !== "batal") {
    if (o.payStatus === "cek") sec += `<button class="btn line" data-act="pay_no" ${dis}>Bayar tidak cocok</button>`;
    if (o.payStatus === "lunas" && (o.status === "baru" || o.status === "diproses")) sec += `<button class="btn line" data-act="pay_undo" ${dis}>Batalkan konfirmasi bayar</button>`;
    if (o.status !== "selesai") sec += armCancel === o.id ? `<button class="btn danger" data-act="cancel" ${dis}>Yakin batalkan pesanan?</button>` : `<button class="btn line" data-act="arm_cancel" ${dis}>Batalkan pesanan</button>`;
  }
  return `<article class="orow ${o.payStatus === "cek" && o.status !== "batal" ? "attn" : ""}" data-oid="${esc(o.id)}">
    <div class="orow-h">
      <div style="min-width:0"><div class="o1"><span class="num">${esc(o.id)}</span><span class="oname">${esc(o.nama || "Tanpa nama")}</span>${o.source === "wa" ? '<span class="otag">WA</span>' : ""}${hasNote ? '<span class="otag">Ada catatan</span>' : ""}</div>
        <div class="o2">${esc(meta)}</div><div class="o3">${esc(summary)}</div></div>
      <div class="oside"><span class="chip ${sc}">${sl}</span>${pa ? `<button class="btn sm ${pa[2]}" data-act="${pa[0]}" ${dis}>${pa[1]}</button>` : ""}<button class="btn line sm iconbtn" data-toggle aria-expanded="${open}" aria-label="${open ? "Tutup detail" : "Buka detail"}" title="${open ? "Tutup detail" : "Buka detail"}">${ic("chevron", open ? "flip" : "")}</button></div>
    </div>
    ${open ? `<div class="odetail">
      <div class="dgrid">
        <div class="kv"><small>Pelanggan</small><span>${esc(o.nama || "-")}<br><a href="${esc(wa)}" target="_blank" rel="noopener">${esc(o.hp)}</a></span></div>
        <div class="kv"><small>${pk ? "Ambil di" : "Alamat antar"}</small><span>${pk ? esc(o.pickupLoc || pickLoc()) : esc((o.area ? o.area + " · " : "") + (o.alamat || "-"))}</span></div>
        <div class="kv"><small>Jadwal</small><span>${pk ? "Ambil" : "Antar"} ${o.poDate ? esc(dLong(o.poDate)) : "-"}${o.hours ? ", jam " + esc(o.hours) : ""}</span></div>
        <div class="kv"><small>Dipesan</small><span>${fmtTime(o.createdAt)} · ${o.method === "qris" ? "QRIS" : "Transfer"}</span></div>
      </div>
      ${o.notes ? `<p class="onote">Catatan: ${esc(o.notes)}</p>` : ""}
      <ul class="itl">${o.items.map(i => `<li><span>${Number(i.qty) || 0} × ${esc(i.name)}${i.option ? " (" + esc(i.option) + ")" : ""}</span><span>${Number(i.price) ? rp((Number(i.price) || 0) * (Number(i.qty) || 0)) : "Gratis"}</span></li>${i.note ? `<li class="inl">Catatan: ${esc(i.note)}</li>` : ""}`).join("")}${o.ongkir ? `<li><span>Ongkir Lalamove</span><span>${rp(o.ongkir)}</span></li>` : ""}</ul>
      <div class="ototal"><span>Total pesanan ini</span><span>${rp(o.total)}</span></div>
      ${gk ? `<p class="onote">Pelanggan diminta transfer ${rp(Number(o.groupTotal) + gk)}, termasuk kode unik ${rp(gk)}. Cari angka ini di mutasi bank.</p>` : ""}
      ${grp ? `<p class="onote">Bayar gabungan untuk ${o.groupCount} tanggal PO, total ${rp(o.groupTotal)}. Konfirmasi bayar berlaku untuk semuanya.</p>` : ""}
      <div class="acts"><a class="btn line" href="${esc(wa)}" target="_blank" rel="noopener">Chat pelanggan</a>${sec}</div>
    </div>` : ""}</article>`;
}
function renderAdminOrders(){
  const el = $("a-orders");
  if (ordersState === "loading") { el.innerHTML = '<p class="note">Memuat pesanan...</p>'; return; }
  const cekAll = orders.filter(FILTERS[0][2]).length;
  if (newOpen) { setCek(cekAll); return; }
  if (poFilter !== "semua" && !(pos || []).some(p => p.id === poFilter)) poFilter = "semua";
  const base = orders.filter(o => poFilter === "semua" || o.poId === poFilter);
  const cnt = k => base.filter(FILTERS.find(f => f[0] === k)[2]).length;
  if (filter === null && orders.length) filter = ["cek", "siap", "kirim"].find(k => cnt(k) > 0) || "semua";
  const cur = filter || "semua", f = FILTERS.find(x => x[0] === cur) || FILTERS[5];
  const list = base.filter(f[2]);
  const poOpts = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byPo = {}; list.forEach(o => { const k = o.poDate || "-"; (byPo[k] = byPo[k] || []).push(o); });
  const dates = Object.keys(byPo).sort((a, b) => a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b));
  el.innerHTML = `
    <div class="toolbar">
      <div class="stabs" role="group" aria-label="Filter status">${FILTERS.map(x => { const n = cnt(x[0]); return `<button type="button" data-filter="${x[0]}" aria-pressed="${x[0] === cur}">${x[1]}<span class="c ${x[0] === "cek" && n ? "hot" : ""}">${n}</span></button>`; }).join("")}</div>
      <select id="f-po" class="sel" aria-label="Filter tanggal PO"><option value="semua">Semua tanggal</option>${poOpts.map(p => `<option value="${esc(p.id)}" ${p.id === poFilter ? "selected" : ""}>${esc(dShort(p.date))}</option>`).join("")}</select>
      <button class="btn sm add" data-newopen type="button">${ic("plus")}Pesanan</button>
    </div>
    ${dates.length ? dates.map(d => { const os = byPo[d], por = os.reduce((a, o) => a + o.items.filter(i => !i.addon).reduce((s, i) => s + (Number(i.qty) || 0), 0), 0);
      return `<div class="group"><span>${d === "-" ? "Tanggal PO tidak tercatat" : esc(dLong(d))}</span><span>${os.length} pesanan · ${por} porsi</span></div><div class="olist">${os.map(orderRow).join("")}</div>`; }).join("")
      : `<div class="empty" style="margin-top:16px">${EMPTY[cur] || EMPTY.semua}</div>`}`;
  setCek(cekAll);
}
$("a-orders").addEventListener("change", e => { if (e.target.id === "f-po") { poFilter = e.target.value; renderAdminOrders(); } });
$("a-orders").addEventListener("click", async e => {
  if (e.target.closest("[data-newopen]")) { openNew(); return; }
  const fb = e.target.closest("[data-filter]");
  if (fb) { filter = fb.dataset.filter; armCancel = null; renderAdminOrders(); return; }
  const row = e.target.closest("[data-oid]");
  if (e.target.closest("[data-toggle]") && row) { const id = row.dataset.oid; if (expanded.has(id)) { expanded.delete(id); armCancel = null; } else expanded.add(id); renderAdminOrders(); return; }
  const b = e.target.closest("[data-act]"); if (!b || !row) return;
  const id = row.dataset.oid, act = b.dataset.act;
  const o = orders.find(x => x.id === id); if (!o || busy.has(id)) return;
  if (act === "arm_cancel") { armCancel = id; renderAdminOrders(); return; }
  const group = () => o.gid ? orders.filter(x => x.gid === o.gid) : [o];
  let targets = [o], mk;
  if (act === "pay_ok") { targets = group(); mk = () => ({ payStatus:"lunas" }); }
  else if (act === "pay_undo") { targets = group(); mk = () => ({ payStatus:"cek" }); }
  else if (act === "pay_no") { targets = group(); mk = () => ({ payStatus:"ditolak", status:"baru" }); }
  else if (act === "next") mk = x => ({ status:NEXT[x.status] });
  else if (act === "cancel") mk = () => ({ status:"batal" });
  else if (act === "reopen") mk = x => ({ status:"baru", payStatus:x.payStatus === "ditolak" ? "cek" : x.payStatus });
  else return;
  armCancel = null; targets.forEach(x => busy.add(x.id)); renderAdminOrders();
  try { for (const x of targets) await api.setOrder(x.id, { payStatus:x.payStatus, status:x.status, ...mk(x) }); await refreshOrders(); }
  catch (err) { toast("Gagal menyimpan. Coba lagi."); }
  targets.forEach(x => busy.delete(x.id)); renderAdminOrders();
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
      <div><label class="lb" style="margin-top:0">Cara terima</label><div class="seg" id="n-fulfil"><label><input type="radio" name="nf" value="antar" checked>Antar</label><label><input type="radio" name="nf" value="ambil">Ambil sendiri</label></div></div>
    </div>
    <div class="grid2">
      <div><label class="lb" for="n-nama">Nama</label><input type="text" id="n-nama" placeholder="Nama lengkap"><div class="err" id="n-e-nama"></div></div>
      <div><label class="lb" for="n-hp">No. HP</label><input type="tel" id="n-hp" inputmode="tel" placeholder="08123456789"><div class="err" id="n-e-hp"></div></div>
    </div>
    <div id="n-addr">
      <label class="lb" for="n-area">Wilayah</label><select id="n-area"><option value="">Pilih wilayah</option>${AREAS.map(a => `<option>${a}</option>`).join("")}</select><div class="err" id="n-e-area"></div>
      <label class="lb" for="n-alamat">Alamat lengkap</label><textarea id="n-alamat" placeholder="Jalan, nomor rumah, patokan"></textarea><div class="err" id="n-e-alamat"></div>
    </div>
    <label class="lb" for="n-notes">Catatan</label><textarea id="n-notes" placeholder="Contoh: tidak pakai cabai"></textarea>
    <div class="label">Menu</div>
    ${list.map(p => { const opts = optsOf(p), adds = addonsOf(p);
      return `<div class="nitem"><div class="nrow"><div><b>${esc(p.name)}</b> <small>${optsOf(p).some(o => o.custom) ? "mulai " + rp(fromPrice(p)) : rp(p.price)}${p.available === false ? " · habis" : ""}</small></div>${opts.length ? "" : mstep(p.id, p.name)}</div>
        ${opts.length ? `<div class="vpanel" style="display:block">${variantsHTML(p, p.id, mstep)}</div>` : ""}
        ${adds.length ? `<div class="subs"><div class="subs-title">Tambahan</div>${adds.map(a => `<div class="sub"><span>${esc(a.name)}<em>${a.price ? "+" + rp(a.price) : "gratis"}</em></span>${mstep(p.id + "::+" + a.id, a.name + " untuk " + p.name)}</div>`).join("")}</div>` : ""}
        <div class="noterow" style="margin-top:8px"><input type="text" class="inote" data-nnote="${esc(p.id)}" maxlength="120" placeholder="Catatan" aria-label="Catatan untuk ${esc(p.name)}"></div></div>`; }).join("") || '<div class="empty">Belum ada menu.</div>'}
    <div class="grid2" style="margin-top:12px">
      <div><label class="lb" for="n-ong" style="margin-top:0">Ongkir (Rp)</label><input type="number" id="n-ong" min="0" step="500" inputmode="numeric" value="${flat()}"></div>
      <div><label class="lb" for="n-method" style="margin-top:0">Bayar via</label><select id="n-method"><option value="transfer">Transfer</option><option value="qris">QRIS</option></select></div>
      <div><label class="lb" for="n-pay" style="margin-top:0">Status bayar</label><select id="n-pay"><option value="cek">Belum bayar</option><option value="lunas">Lunas</option></select></div>
    </div>
    <div class="ntot"><span class="muted" id="n-sum"></span><b id="n-total">Rp 0</b></div>
    <button class="btn" id="n-save" type="button">Buat pesanan</button></div>`;
  nSync();
}
function nTotals(){ const ls = mLines(), food = ls.reduce((a, l) => a + l.price * l.qty, 0), ong = $("n-ong") ? Math.max(0, Math.round(Number($("n-ong").value) || 0)) : 0; return { ls, food, ong, total:food + ong }; }
function nSync(){
  document.querySelectorAll("#a-new [data-nk]").forEach(c => {
    const k = c.dataset.nk, s = k.split("::");
    c.querySelector("[data-q]").textContent = mcart[k] || 0;
    if ((s[1] || "").startsWith("+")) c.querySelector('[data-nd="1"]').disabled = (mcart[k] || 0) >= mMain(s[0]);
  });
  const t = nTotals(); $("n-total").textContent = rp(t.total); $("n-sum").textContent = `Menu ${rp(t.food)} + ongkir ${rp(t.ong)}`;
}
function manualText(o, paid){
  const pk = o.fulfil === "ambil";
  return `Halo kak ${o.nama}, pesanan Anda di Lapo Doli sudah kami catat.

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
  if (pick) { chk("area", ""); chk("alamat", ""); } else { chk("area", val.area(g("area"))); chk("alamat", val.alamat(g("alamat"))); }
  const t = nTotals(), po = (pos || []).find(x => x.id === g("po"));
  if (!po) { toast("Pilih tanggal PO dulu"); return; }
  if (!t.ls.some(l => !l.addon)) { toast("Pilih minimal satu menu"); return; }
  if (!ok) { const f = document.querySelector("#a-new .err:not(:empty)"); if (f) f.scrollIntoView({ behavior:"smooth", block:"center" }); return; }
  const btn = $("n-save"); btn.disabled = true;
  try {
    const seenN = {}, lines = t.ls.map(l => { let note = ""; if (!l.addon && !seenN[l.pid]) { seenN[l.pid] = 1; const el = document.querySelector(`[data-nnote="${l.pid}"]`); note = el ? el.value.trim() : ""; }
      return linePayload({ ...l, note }); });
    const paid = g("pay") === "lunas";
    const res = await api.createOrders({ nama:g("nama").trim(), hp:g("hp").trim(), fulfil:pick ? "ambil" : "antar", area:pick ? "" : g("area"), alamat:pick ? "" : g("alamat").trim(),
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
  } catch (e) { toast("Gagal menyimpan. Coba lagi."); btn.disabled = false; }
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
    const auto = po.open === true && isPast(po), on = po.open === true && !auto;
    return `<div class="porow ${on ? "" : "off"}" data-po="${esc(po.id)}">
      <div class="po-h"><div><h3>${esc(dLong(po.date))}</h3><span class="note">${os.length} pesanan${os.length ? ` · ${lunas} lunas` : ""}</span></div>
        <label class="switch"><input type="checkbox" id="po-open-${esc(po.id)}" data-poopen ${on ? "checked" : ""} ${auto ? "disabled" : ""}><span class="track"></span><span>${on ? "Buka" : auto ? "Tutup otomatis" : "Tutup"}</span></label>
        <button class="textbtn iconbtn-t ${armPoDel === po.id ? "dangerbtn" : ""}" data-podel type="button" aria-label="Hapus PO" title="Hapus PO">${armPoDel === po.id ? "Yakin hapus?" : ic("trash")}</button></div></div>`;
  }).join("");
  el.innerHTML = `<div class="newpo"><input type="date" id="po-new" aria-label="Tanggal PO baru"><button class="btn sm add" data-poadd type="button">${ic("plus")}Buka PO</button></div>
    ${rows || '<div class="empty">Belum ada PO.</div>'}`;
}
const poEl = $("a-po");
let poDirty = false;
function renderPoSafe(){
  const a = document.activeElement;
  if (a && poEl.contains(a) && a.matches("input[type=date]")) { poDirty = true; return; }
  poDirty = false; renderAdminPo();
}
poEl.addEventListener("focusout", () => setTimeout(() => { if (poDirty) renderPoSafe(); }, 50));
poEl.addEventListener("change", async e => {
  const t = e.target; if (!t.matches("[data-poopen]")) return;
  const id = t.closest("[data-po]").dataset.po;
  try { await api.setPoOpen(id, t.checked); await refreshPos(); toast(t.checked ? "PO dibuka" : "PO ditutup"); }
  catch (err) { toast("Gagal menyimpan. Coba lagi."); renderAdminPo(); }
});
poEl.addEventListener("click", async e => {
  try {
    if (e.target.closest("[data-poadd]")) {
      const v = $("po-new").value;
      if (!dparse(v)) { toast("Pilih tanggal PO dulu"); return; }
      const id = "po-" + v.replace(/-/g, "");
      if ((pos || []).some(p => p.id === id)) { toast("PO tanggal itu sudah ada"); return; }
      await api.addPo(v); await refreshPos();
      toast("PO dibuka"); return;
    }
    const d = e.target.closest("[data-podel]");
    if (d) {
      const id = d.closest("[data-po]").dataset.po;
      if (orders.some(o => o.poId === id)) { toast("Sudah ada pesanan di PO ini. Tutup saja, jangan dihapus."); return; }
      if (armPoDel !== id) { armPoDel = id; renderAdminPo(); return; }
      armPoDel = null; await api.deletePo(id); await refreshPos(); toast("PO dihapus");
    }
  } catch (err) { toast("Gagal menyimpan. Coba lagi."); }
});

/* --- menu dan harga --- */
const thumbAdmin = p => imgSrc(p) ? `<img src="${esc(imgSrc(p))}" alt="${esc(p.name)}">` : esc(p.emoji || "🍽️");
const advOpen = new Set();
function renderAdminMenu(){
  const el = $("a-menu");
  if (products === null) { el.innerHTML = '<p class="note">Memuat menu...</p>'; return; }
  const rows = products.map(p => `
    <div class="prow ${p.available === false ? "off" : ""}" data-pid="${esc(p.id)}">
      <label class="pimg" title="Ganti foto">${thumbAdmin(p)}${assetsNs ? "<small>Ganti foto</small>" : ""}${assetsNs ? `<input type="file" accept="image/*" data-up id="up-${esc(p.id)}" aria-label="Foto ${esc(p.name)}">` : ""}</label>
      <div class="pmain">
        <div class="fgrid">
          <div><label class="fl" for="n-${esc(p.id)}">Nama</label><input type="text" id="n-${esc(p.id)}" data-f="name" value="${esc(p.name)}"></div>
          <div><label class="fl" for="pr-${esc(p.id)}">Harga</label><input type="number" id="pr-${esc(p.id)}" data-f="price" value="${Number(p.price) || 0}" min="0" step="500" inputmode="numeric"></div>
          <div><label class="fl" for="q-${esc(p.id)}">Kuota per PO</label><input type="number" id="q-${esc(p.id)}" data-f="quota" value="${p.quota == null ? "" : p.quota}" min="0" step="1" inputmode="numeric" placeholder="Tanpa batas"></div>
          <div class="full"><label class="fl" for="d-${esc(p.id)}">Deskripsi</label><input type="text" id="d-${esc(p.id)}" data-f="desc" value="${esc(p.desc)}"></div>
        </div>
        <details class="adv" data-adv="${esc(p.id)}" ${advOpen.has(p.id) ? "open" : ""}><summary>Varian dan tambahan</summary>
          <div class="fgrid">
            <div class="full"><label class="fl" for="op-${esc(p.id)}">Varian pilihan</label><input type="text" id="op-${esc(p.id)}" data-f="options" value="${esc((Array.isArray(p.options) ? p.options : []).join(", "))}" placeholder="250ml=35000, 500ml=65000"><p class="fhint">Pisahkan dengan koma. Harga beda: nama=harga.</p></div>
            <div class="full"><label class="fl" for="ad-${esc(p.id)}">Tambahan</label><input type="text" id="ad-${esc(p.id)}" data-f="addons" value="${esc(fmtAddons(p))}" placeholder="Nasi=5000, Sop=0"><p class="fhint">Format nama=harga. Harga 0 berarti gratis.</p></div>
            <div><label class="fl" for="em-${esc(p.id)}">Ikon</label><input type="text" id="em-${esc(p.id)}" data-f="emoji" value="${esc(p.emoji || "")}" maxlength="4"></div>
          </div></details>
        <div class="pbar"><label class="switch"><input type="checkbox" id="av-${esc(p.id)}" data-f="available" ${p.available === false ? "" : "checked"}><span class="track"></span><span>${p.available === false ? "Habis" : "Tersedia"}</span></label>
          <button class="textbtn ${armDel === p.id ? "dangerbtn" : ""}" data-del type="button">${armDel === p.id ? "Yakin hapus menu ini?" : ic("trash") + "Hapus"}</button></div>
      </div></div>`).join("");
  el.innerHTML = `
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
async function shrink(file){
  try {
    const bmp = await createImageBitmap(file), s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.82)) || file;
  } catch (e) { return file; }
}
menuEl.addEventListener("change", async e => {
  const t = e.target, row = t.closest("[data-pid]"); if (!row) return;
  const pid = row.dataset.pid;
  try {
    if (t.matches("[data-up]")) {
      const f = t.files[0]; if (!f || !assetsNs) return;
      toast("Mengunggah foto...");
      const blob = await shrink(f);
      const path = await api.uploadImage(blob);
      await api.updateProduct(pid, { image:path }); await refreshProducts(); toast("Foto tersimpan");
      return;
    }
    const k = t.dataset.f; if (!k) return;
    let v;
    if (k === "available") v = t.checked;
    else if (k === "quota") v = t.value.trim() === "" ? null : Math.max(0, Math.round(Number(t.value) || 0));
    else if (k === "price") v = Math.max(0, Math.round(Number(t.value) || 0));
    else if (k === "options") v = t.value.split(",").map(s => s.trim()).filter(Boolean);
    else if (k === "addons") v = parseAddons(t.value);
    else v = t.value.trim();
    if (k === "name" && !v) { toast("Nama menu tidak boleh kosong"); renderAdminMenu(); return; }
    await api.updateProduct(pid, { [k]:v }); await refreshProducts(); toast("Tersimpan");
  } catch (err) { toast("Gagal menyimpan. Coba lagi."); }
});
menuEl.addEventListener("click", async e => {
  try {
    if (e.target.closest("[data-add]")) {
      const max = Math.max(0, ...(products || []).map(p => Number(p.sort) || 0));
      await api.addProduct({ name:"Menu baru", desc:"", price:0, emoji:"🍽️", available:false, sort:max + 1, addons:[NASI] }); await refreshProducts();
      toast("Menu baru ditambahkan. Isi nama dan harga, lalu aktifkan."); return;
    }
    if (e.target.closest("[data-seed]")) {
      for (const p of DEFAULT_PRODUCTS) await api.upsertProduct(p);
      await refreshProducts();
      toast("Menu awal terisi"); return;
    }
    const d = e.target.closest("[data-del]");
    if (d) {
      const pid = d.closest("[data-pid]").dataset.pid;
      if (armDel !== pid) { armDel = pid; renderAdminMenu(); return; }
      armDel = null; await api.deleteProduct(pid); await refreshProducts(); toast("Menu dihapus");
    }
  } catch (err) { toast("Gagal menyimpan. Coba lagi."); }
});

/* --- pengaturan --- */
function renderAdminSet(){
  const s = settings, el = $("a-set");
  const f = (id, key, label, val, opts = "", full = false) => `<div class="${full ? "full" : ""}"><label class="fl" for="${id}">${label}</label><input type="${opts.includes("number") ? "number" : "text"}" id="${id}" data-s="${key}" value="${esc(val)}" ${opts}></div>`;
  el.innerHTML = `
    <section class="card setsec"><h3>Antar dan ambil</h3><div class="fgrid">
      ${f("s-jam", "deliveryHours", "Jam pengantaran", s.deliveryHours, 'placeholder="12.00 - 14.00"')}
      ${f("s-pj", "pickupHours", "Jam ambil", s.pickupHours, 'placeholder="12.00 - 14.00"')}
      ${f("s-co", "poCutoff", "Tutup PO pukul", s.poCutoff, 'placeholder="10:00"')}
      ${f("s-og", "ongkir", "Ongkir (Rp, 0 = gratis)", Number(s.ongkir) || 0, 'number min="0" step="500" inputmode="numeric"')}
      ${f("s-pl", "pickupLocation", "Lokasi ambil", s.pickupLocation, "", true)}
    </div></section>
    <section class="card setsec"><h3>Pembayaran</h3><div class="fgrid">
      ${f("s-bn", "bankName", "Nama bank", s.bankName)}
      ${f("s-bno", "bankNumber", "Nomor rekening", s.bankNumber, 'inputmode="numeric"')}
      ${f("s-bh", "bankHolder", "Atas nama", s.bankHolder)}
    </div>
    <div class="qrisbox">${s.qrisUrl ? `<img src="${esc(s.qrisUrl)}" alt="QRIS">` : ""}
      <div><div class="fl">QRIS</div>${s.qrisUrl ? "" : '<p class="fhint" style="margin:0 0 8px">Belum ada gambar.</p>'}
      <div class="acts">${assetsNs ? `<label class="btn line sm filebtn">${s.qrisUrl ? "Ganti" : "Unggah"}<input type="file" accept="image/*" id="s-qris" data-qris aria-label="Unggah gambar QRIS"></label>` : '<span class="fhint">Butuh akses edit.</span>'}${s.qrisUrl ? '<button class="btn line sm" data-qris-del type="button">Hapus QRIS</button>' : ""}</div></div></div></section>
    <section class="card setsec"><h3>Kode unik</h3>
      <label class="switch"><input type="checkbox" id="s-uc" data-s="uniqueCode" ${s.uniqueCode !== false ? "checked" : ""}><span class="track"></span><span>${s.uniqueCode !== false ? "Aktif" : "Mati"}</span></label>
      <p class="fhint">Tambah Rp 1 sampai 999 ke jumlah transfer agar mudah dicocokkan di mutasi bank.</p></section>
    <section class="card setsec"><h3>Kontak</h3><div class="fgrid">
      ${f("s-wa", "waNumber", "WhatsApp admin (62...)", s.waNumber, 'inputmode="numeric"')}
    </div></section>`;
}
const setEl = $("a-set");
let setDirty = false;
function renderSetSafe(){
  const a = document.activeElement;
  if (a && setEl.contains(a) && a.matches("input[type=text],input[type=number]")) { setDirty = true; return; }
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
  } catch (e) { toast("Gagal menyimpan. Coba lagi."); }
}
setEl.addEventListener("change", async e => {
  const t = e.target;
  if (t.matches("[data-qris]")) {
    const f = t.files[0]; if (!f || !assetsNs) return;
    try { toast("Mengunggah..."); const blob = await shrink(f); const path = await api.uploadImage(blob); await saveSetting({ qrisPath:path }); }
    catch (err) { toast("Gagal mengunggah gambar."); }
    return;
  }
  const k = t.dataset.s; if (!k) return;
  let v = t.type === "checkbox" ? t.checked : t.type === "number" ? Math.max(0, Math.round(Number(t.value) || 0)) : t.value.trim();
  if (k === "waNumber") v = normPhone(v);
  if (k === "poCutoff") { if (!/^\d{1,2}[:.]\d{2}$/.test(v)) { toast("Format jam salah. Contoh: 10:00"); renderAdminSet(); return; } v = v.replace(".", ":").padStart(5, "0"); }
  if (["deliveryHours", "pickupHours", "pickupLocation"].includes(k) && !v) v = DEFAULT_SETTINGS[k];
  await saveSetting({ [k]:v });
});
setEl.addEventListener("click", e => { if (e.target.closest("[data-qris-del]")) saveSetting({ qrisPath:"" }); });

/* --- penjualan --- */
let salesPo = "semua", salesBasis = "lunas";
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
function renderSales(){
  const el = $("a-sales");
  if (ordersState === "loading") { el.innerHTML = '<p class="note">Memuat data penjualan...</p>'; return; }
  if (!orders.length) { el.innerHTML = '<div class="empty">Belum ada pesanan. Grafik penjualan muncul setelah pesanan pertama masuk.</div>'; return; }
  const poSorted = [...(pos || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (salesPo !== "semua" && !poSorted.some(p => p.id === salesPo)) salesPo = "semua";
  const live = orders.filter(o => o.status !== "batal" && o.payStatus !== "ditolak");
  const inBasis = o => salesBasis === "semua" || o.payStatus === "lunas";
  const scope = live.filter(o => salesPo === "semua" || o.poId === salesPo);
  const base = scope.filter(inBasis), wait = scope.filter(o => o.payStatus === "cek");
  const food = base.reduce((a, o) => a + foodOf(o), 0), fee = base.reduce((a, o) => a + o.ongkir, 0), qty = base.reduce((a, o) => a + portionsOf(o), 0);
  const phones = {}; base.forEach(o => { const k = normPhone(o.hp); phones[k] = (phones[k] || 0) + 1; });
  const cust = Object.keys(phones).length, repeat = Object.values(phones).filter(n => n > 1).length;
  const waitSum = wait.reduce((a, o) => a + o.total, 0);

  const items = poSorted.map(po => { const os = live.filter(o => o.poId === po.id && inBasis(o));
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
      <div class="stabs" role="group" aria-label="Dasar hitung"><button type="button" data-sbasis="lunas" aria-pressed="${salesBasis === "lunas"}">Lunas</button><button type="button" data-sbasis="semua" aria-pressed="${salesBasis === "semua"}">Semua</button></div>
    </div>
    <div class="herostat"><span class="k">Penjualan${salesBasis === "lunas" ? " lunas" : ""}</span><b>${rp(food)}</b><span class="s">${base.length} pesanan, masuk ${rp(food + fee)} dengan ongkir</span></div>
    <div class="tiles">
      <div class="tile"><span>Porsi terjual</span><b>${qty}</b></div>
      <div class="tile"><span>Rata-rata pesanan</span><b>${base.length ? rp(Math.round(food / base.length)) : "-"}</b></div>
      <div class="tile"><span>Pelanggan</span><b>${cust}</b><small>${repeat} berulang</small></div>
      <div class="tile"><span>Belum dicek bayar</span><b>${rp(waitSum)}</b><small>${wait.length} pesanan</small></div>
    </div>
    <div class="panels">
      <div class="panel wide"><h3>Penjualan per tanggal PO</h3>${items.length ? colChart(items) : '<p class="note">Belum ada PO.</p>'}</div>
      <div class="panel"><h3>Menu terlaris</h3>${menuRows.length ? hbars(menuRows) : '<p class="note">Belum ada data.</p>'}</div>
      <div class="panel"><h3>Antar atau ambil sendiri</h3>${base.length ? `<div class="stack">${seg("a", nAntar, "Antar")}${seg("b", nAmbil, "Ambil sendiri")}</div><div class="legend"><span><i class="sw a"></i>Antar <b>${nAntar}</b></span><span><i class="sw b"></i>Ambil sendiri <b>${nAmbil}</b></span></div>` : '<p class="note">Belum ada data.</p>'}</div>
      <div class="panel"><h3>Wilayah pengantaran</h3>${areaRows.length ? hbars(areaRows) : '<p class="note">Belum ada pesanan antar.</p>'}</div>
      <div class="panel"><h3>Nasi dan sop</h3>${Object.keys(add).length ? hbars(Object.keys(add).map(n => ({ label:n, value:add[n].qty, a:add[n].qty + " porsi", c:add[n].rev ? rp(add[n].rev) : "Gratis" })).sort((a, b) => b.value - a.value)) : '<p class="note">Belum ada tambahan.</p>'}</div>
    </div>
    <details class="tview panel"><summary>Lihat sebagai tabel</summary><div class="tw"><table><thead><tr><th>Tanggal PO</th><th class="r">Pesanan</th><th class="r">Porsi</th><th class="r">Penjualan</th></tr></thead><tbody>${poSorted.map(po => { const os = live.filter(o => o.poId === po.id && inBasis(o));
      return `<tr><td>${esc(dLong(po.date))}</td><td class="r">${os.length}</td><td class="r">${os.reduce((a, o) => a + portionsOf(o), 0)}</td><td class="r">${rp(os.reduce((a, o) => a + foodOf(o), 0))}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="tw"><table><thead><tr><th>Menu (sesuai filter)</th><th class="r">Porsi</th><th class="r">Penjualan</th></tr></thead><tbody>${Object.keys(menu).map(n => `<tr><td>${esc(n)}</td><td class="r">${menu[n].qty}</td><td class="r">${rp(menu[n].rev)}</td></tr>`).join("") || '<tr><td colspan="3">Belum ada data.</td></tr>'}</tbody></table></div></details>
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
const dayStart = () => { const d = new Date(); return d.toISOString().slice(0, 10); };
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
  const orderCard = o => `<div class="rk-o"><div><b>${esc(o.nama)}</b> <span class="muted">${esc(o.id)} · ${esc(o.hp)}</span></div>${o.fulfil !== "ambil" ? `<div class="muted">${esc(o.alamat)}</div>` : ""}<div>${esc(itemLine(o))}</div>${o.notes ? `<div class="rk-note">Catatan: ${esc(o.notes)}</div>` : ""}</div>`;
  const areas = {}; r.antar.forEach(o => { (areas[o.area || "Tanpa wilayah"] = areas[o.area || "Tanpa wilayah"] || []).push(o); });
  el.innerHTML = `<div class="kitchen">
    <div class="toolbar rk-tools">
      <select id="rk-po" class="sel" aria-label="Tanggal PO">${r.poSorted.map(p => `<option value="${esc(p.id)}" ${p.id === rekapPo ? "selected" : ""}>${esc(dLong(p.date))}</option>`).join("")}</select>
      <div class="stabs" role="group" aria-label="Pesanan yang dihitung"><button type="button" data-rkb="semua" aria-pressed="${rekapBasis === "semua"}">Semua</button><button type="button" data-rkb="lunas" aria-pressed="${rekapBasis === "lunas"}">Lunas</button></div>
      <div class="acts tools"><button class="btn line sm iconbtn" data-rk="copy" type="button" aria-label="Salin rekap" title="Salin rekap">${ic("copy")}</button><button class="btn line sm iconbtn" data-rk="print" type="button" aria-label="Cetak rekap" title="Cetak rekap">${ic("print")}</button><button class="btn line sm iconbtn" data-rk="csv" type="button" aria-label="Ekspor semua pesanan ke CSV" title="Ekspor semua pesanan ke CSV">${ic("download")}</button></div>
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
  else if (k.dataset.rk === "copy") { try { await navigator.clipboard.writeText(rekapText(rekapData())); toast("Rekap disalin"); } catch (err) { toast("Tidak bisa menyalin. Coba cetak atau ekspor."); } }
});

/* --- tab dan navigasi --- */
function renderAdmin(){
  if (view !== "admin" || !isAdmin) return;
  renderAdminOrders();
  if (tab === "sales") renderSales();
  if (tab === "rekap") renderRekap();
  if (tab === "po") renderPoSafe();
  if (tab === "menu") renderMenuSafe();
  if (tab === "set") renderSetSafe();
}
function setTab(t){
  tab = t;
  document.querySelectorAll("#tabs [data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  $("a-orders").hidden = t !== "orders" || newOpen; $("a-new").hidden = !(t === "orders" && newOpen); $("a-sales").hidden = t !== "sales"; $("a-po").hidden = t !== "po"; $("a-menu").hidden = t !== "menu"; $("a-set").hidden = t !== "set";
  $("a-rekap").hidden = t !== "rekap";
  if (t === "sales") renderSales();
  if (t === "rekap") renderRekap();
  if (t === "po") renderAdminPo();
  if (t === "menu") renderAdminMenu();
  if (t === "set") renderAdminSet();
}
/* jumlah pesanan yang perlu dicek, tampil di sidebar dan di tombol Menu (HP) */
function setCek(n){ [$("n-cek"), $("n-cek-top")].forEach(b => { b.hidden = !n; b.textContent = n; }); }
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
  view = v;
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
document.querySelectorAll("[data-help]").forEach(b => { b.onclick = () => setView("help"); });
$("help-back").onclick = () => setView("shop");

/* ================= LOGIN ADMIN ================= */
function renderGate(){
  const el = $("admin-gate");
  if (!sb) { el.innerHTML = '<div class="empty">Toko belum tersambung ke database. Isi file config.js sesuai README.</div>'; return; }
  if (!authReady) { el.innerHTML = '<p class="note" style="text-align:center">Memeriksa login...</p>'; return; }
  if (session) {
    el.innerHTML = `<div class="card"><h3>Akun ini belum terdaftar sebagai admin</h3><p class="fhint">Anda masuk sebagai ${esc(session.user.email)}. Minta pemilik toko mendaftarkan email ini sebagai admin.</p><button class="btn line sm" id="gate-out" type="button" style="margin-top:12px">Keluar</button></div>`;
    $("gate-out").onclick = signOut; return;
  }
  el.innerHTML = `<div class="card"><h3>Masuk admin</h3><p class="fhint" style="margin-top:-6px">Masukkan email admin. Kami kirim link masuk ke email itu, tanpa password.</p>
    <label class="fl" for="gate-email">Email</label><input type="text" id="gate-email" inputmode="email" autocomplete="email" placeholder="nama@email.com">
    <div class="err" id="gate-err"></div><button class="btn" id="gate-send" type="button" style="margin-top:6px">Kirim link masuk</button></div>`;
  $("gate-send").onclick = sendMagic;
  $("gate-email").addEventListener("keydown", e => { if (e.key === "Enter") sendMagic(); });
}
async function sendMagic(){
  const email = $("gate-email").value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("gate-err").textContent = "Email tidak valid."; return; }
  $("gate-err").textContent = ""; $("gate-send").disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo:location.origin + "/?admin=1" } });
  if (error) { $("gate-send").disabled = false; $("gate-err").textContent = "Link belum terkirim. Coba lagi sebentar lagi."; return; }
  $("admin-gate").innerHTML = `<div class="card"><h3>Cek email Anda</h3><p class="fhint" style="margin:0">Link masuk sudah dikirim ke ${esc(email)}. Buka emailnya lalu klik link itu. Kalau belum ada, cek folder spam.</p></div>`;
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
  if (!sb) { $("ck-err").textContent = "Toko belum tersambung ke database."; return; }
  $("ck-go").disabled = true; out.innerHTML = "";
  try {
    const rows = await api.trackOrders(ids, hp);
    out.innerHTML = rows.length ? rows.map(r => { const [lb, cl] = statusLabel({ fulfil:r.fulfil, payStatus:r.pay_status, status:r.status });
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
  try { products = await api.loadProducts(); dbState = "ok"; }
  catch (e) { if (products === null) dbState = "error"; renderMenu(); return; }
  await refreshRemaining(); if (view === "admin" && tab === "menu") renderMenuSafe();
}
async function refreshPos(){
  try { pos = await api.loadPos(); } catch (e) { if (pos === null) pos = []; }
  renderMenu(); renderAdmin();
}
function applySettings(d){
  settings = { ...DEFAULT_SETTINGS, ...d }; settings.qrisUrl = assetUrl(settings.qrisPath);
  renderMenu(); renderPayInfo(); if (view === "admin" && tab === "set") renderSetSafe();
}
async function refreshSettings(){ try { applySettings(await api.loadSettings()); } catch (e) {} }
async function refreshOrders(){
  if (!isAdmin) return;
  try { setOrders(await api.loadOrders()); } catch (e) { ordersState = "ok"; renderAdmin(); }
}
let ordersChannel = null;
function startAdmin(){
  refreshOrders();
  if (!ordersChannel) ordersChannel = sb.channel("lapo-orders").on("postgres_changes", { event:"*", schema:"public", table:"orders" }, () => debounced("orders", refreshOrders)).subscribe();
}
function stopAdmin(){ if (ordersChannel) { sb.removeChannel(ordersChannel); ordersChannel = null; } orders = []; ordersState = "loading"; }
function subscribeRealtime(){
  const ch = sb.channel("lapo-public");
  [["products", refreshProducts], ["pos", refreshPos], ["settings", refreshSettings]].forEach(([t, fn]) => ch.on("postgres_changes", { event:"*", schema:"public", table:t }, () => debounced(t, fn)));
  ch.subscribe();
}
async function init(){
  renderMenu(); updateBar(); go(1);
  setInterval(checkClosings, 15000); document.addEventListener("visibilitychange", checkClosings);
  const q = new URLSearchParams(location.search), hasTokens = /access_token|refresh_token|error_description/.test(location.hash);
  const wantAdmin = location.hash === "#admin" || !!q.get("admin");
  if (wantAdmin && !hasTokens) setView("admin");
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
