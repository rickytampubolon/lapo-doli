// Membuat admin.html dari index.html. Jalankan setiap kali index.html berubah:  node tools/sync-admin.js
// admin.html dilayani di /admin (cleanUrls) dengan manifest, judul, dan warna khusus admin, supaya aplikasi
// yang dipasang dari /admin membuka tampilan admin. Safari di iPhone membaca manifest saat halaman dimuat,
// jadi manifest harus sudah ada di HTML, tidak bisa diganti lewat JavaScript.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let h = fs.readFileSync(path.join(root, "index.html"), "utf8");
const swap = (re, to) => { if (!re.test(h)) throw new Error("tidak ketemu: " + re); h = h.replace(re, to); };
swap(/<title>[^<]*<\/title>/, "<title>Lapo Doli Admin</title>");
swap(/<meta name="description"[^>]*>/, '<meta name="description" content="Kelola pesanan, menu, dan PO Lapo Doli.">\n<meta name="robots" content="noindex, nofollow">');
swap(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#f7efe5">\n<meta name="apple-mobile-web-app-title" content="Lapo Admin">');
swap(/<link rel="manifest" href="[^"]*">/, '<link rel="manifest" href="/admin.webmanifest">');
h = h.replace(/<link rel="canonical"[^>]*>\n?/, "");
h = h.replace(/<meta property="og:[^>]*>\n?/g, "").replace(/<meta name="twitter:[^>]*>\n?/g, "");
h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, "");
fs.writeFileSync(path.join(root, "admin.html"), h);
console.log("admin.html diperbarui");
