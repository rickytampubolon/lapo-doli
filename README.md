# Lapo Doli: toko PO online

Toko pre-order untuk Lapo Doli. Pembeli pesan lewat website, admin mengelola menu, PO, pesanan, dan pembayaran dari halaman admin.

- Hosting: Vercel (situs statis, tanpa build)
- Database, login admin, dan penyimpanan foto: Supabase

## Langkah 1. Siapkan Supabase

1. Daftar di https://supabase.com lalu buat project baru (pilih region Singapore).
2. Buka **SQL Editor**, tempel seluruh isi `supabase/schema.sql`, lalu klik **Run**. Aman dijalankan ulang.
3. Daftarkan email admin. Masih di SQL Editor, jalankan:
   ```sql
   insert into public.admins(email) values ('emailkamu@gmail.com');
   ```
   Untuk admin tambahan, jalankan baris yang sama dengan email lain.
4. Buka **Project Settings > API**, salin **Project URL** dan **anon public key**.
5. Isi keduanya di file `config.js`. Jangan pakai `service_role` key.

## Langkah 2. Taruh di GitHub

Buat repository baru di GitHub, lalu upload semua isi folder ini (termasuk `config.js` yang sudah diisi). Anon key memang boleh publik, keamanannya dijaga oleh aturan di database.

## Langkah 3. Deploy di Vercel

1. Daftar di https://vercel.com dengan akun GitHub.
2. **Add New > Project**, pilih repository tadi.
3. Framework pilih **Other**, kolom build dan output biarkan kosong, klik **Deploy**.
4. Kamu akan dapat alamat seperti `lapo-doli.vercel.app`.

## Langkah 4. Atur login admin

Di Supabase buka **Authentication > URL Configuration**:
- **Site URL**: alamat Vercel kamu, misalnya `https://lapo-doli.vercel.app`
- **Redirect URLs**: tambahkan `https://lapo-doli.vercel.app/**`

Kalau nanti pakai domain sendiri, tambahkan juga domain itu di sini.

Admin masuk lewat `alamatkamu/?admin=1`, masukkan email, lalu klik link yang dikirim ke email. Hanya email yang ada di tabel `admins` yang bisa membuka data pesanan.

## Domain sendiri (opsional)

Di Vercel buka **Settings > Domains**, tambahkan domain, lalu ikuti petunjuk DNS yang muncul.

## Cek setelah deploy

- [ ] Halaman depan menampilkan menu dan tanggal PO
- [ ] Buat pesanan percobaan, nomor pesanan muncul (format DDMM-urutan)
- [ ] Login admin lewat `/?admin=1`, pesanan tadi terlihat
- [ ] Konfirmasi bayar, lalu status di layar pembeli ikut berubah
- [ ] Buka satu PO untuk tanggal baru dan cek PO tertutup otomatis pukul 10.00 WIB di hari H
- [ ] Upload foto menu dan QRIS dari tab admin

## Catatan

- Harga 500ml (Kecap 70.000, Teri 50.000) dan Ayam Napinadar (40.000 / 75.000) masih perkiraan. Ubah di tab Menu admin.
- QRIS berupa gambar statis. Pembeli membayar lalu admin mengecek manual.
- Harga, ongkir, dan batas waktu PO dihitung ulang di server, jadi tidak bisa dimanipulasi dari browser.
- Email login bawaan Supabase punya batas kirim per jam. Kalau sering dipakai, pasang SMTP sendiri di Authentication > SMTP.
- Pembeli bisa cek status lewat tombol Bantuan, memakai nomor pesanan dan nomor HP.

## Fitur admin

- **Pesanan**: konfirmasi bayar, ubah status, catat pesanan dari WhatsApp.
- **Penjualan**: ringkasan penjualan per tanggal PO, menu terlaris, wilayah antar.
- **Rekap dapur**: jumlah yang harus dimasak per menu dan varian, daftar antar per wilayah, daftar ambil sendiri. Bisa disalin, dicetak, atau diekspor ke CSV.
- **Menu dan harga**: termasuk **kuota porsi per tanggal PO** (kosong berarti tanpa batas). Pembeli melihat "Sisa N" dan server menolak pesanan yang melebihi sisa.
- **Pengaturan**: ongkir, jam, rekening, QRIS, dan **kode unik pembayaran** (tambahan 1 sampai 100 rupiah di jumlah transfer supaya mudah dicocokkan dengan mutasi bank).

Setiap kali `supabase/schema.sql` berubah, jalankan ulang seluruh isinya di SQL Editor. Aman diulang.

## Opsional: notifikasi pesanan baru ke Telegram

Ikuti petunjuk di bagian atas `supabase/notify-telegram.sql`. Token bot disimpan di Supabase Vault, tidak pernah di repository.

## Alur pembeli

1. Pilih tanggal PO, pilih menu, lalu **Pesan sekarang**. Pesanan langsung tercatat (status menunggu bayar).
2. Layar berikutnya menampilkan jumlah transfer yang tepat (dengan kode unik yang dibuat server) dan nomor rekening atau QRIS. Pembeli mengunggah foto bukti bayar langsung di halaman (tidak lewat WhatsApp). Kalau admin menandai pembayaran tidak cocok, pembeli bisa mengunggah ulang dan statusnya kembali ke dicek.
3. Keranjang, data pembeli, dan pesanan terakhir disimpan di browser. Pembeli bisa kembali ke info bayar dan status dari kartu di beranda.

Pesanan yang belum dibayar lebih dari 1 jam tidak lagi menahan kuota porsi. Pesanannya tetap ada di admin sampai dibatalkan.

Setiap kali `supabase/schema.sql` berubah, jalankan ulang isinya di SQL Editor (aman diulang).

## Pengujian logika

Kalkulasi dan aturan pesanan diuji dengan Postgres sungguhan, bukan hanya dibaca. Skenario yang dicakup:
harga varian dan tambahan, ongkir per tanggal, antar dan ambil sendiri, kode unik (1 sampai 100, tidak kembar di antara
pesanan yang masih menunggu bayar), kuota per tanggal PO, PO tutup dan terjadwal, batas spam, nomor pesanan antar tahun,
pesanan ganda saat kirim ulang (kunci idempotensi `ref`), hak admin, dan bukti bayar. Total yang dihitung browser juga
dibandingkan dengan total database untuk ratusan keranjang acak.

Menjalankan ulang: `PGHOST=localhost PGUSER=postgres sh tests/run.sh` (butuh Postgres lokal, tidak menyentuh Supabase). Hasil terakhir: 68 pemeriksaan lulus, 105 pesanan dalam satu PO bernomor unik, dan 119 keranjang acak totalnya sama antara browser dan database.

Aturan penting yang tertanam:
- Harga selalu dihitung ulang di server dari tabel menu. Angka di browser hanya tampilan.
- Konfirmasi atau penolakan bayar berlaku untuk seluruh pesanan satu checkout, kecuali yang sudah dibatalkan.
- Keranjang di browser tidak dipangkas sebelum jadwal PO berhasil dimuat, supaya sinyal buruk tidak menghapusnya.

## Bagikan ke teman dan pratinjau link

Beranda dan layar "pesanan dicatat" punya kartu **Ajak teman pesan**: satu baris dengan tombol **Bagikan**: memakai lembar bagikan bawaan HP (yang sudah punya "Salin link"), atau membuka WhatsApp bila tidak tersedia.

Pratinjau saat link dibagikan (WhatsApp, Instagram, Threads) dibaca dari tag `og:*` dan `twitter:*` di `<head>` `index.html`, dengan gambar `assets/og.png` (1200x630, logo di atas krem). Tag ini harus berisi alamat penuh. Kalau nanti pakai domain sendiri, ganti `https://lapo-doli.vercel.app` di `index.html`.
WhatsApp menyimpan pratinjau lama selama berhari-hari. Setelah mengganti gambar, bagikan link dengan akhiran baru (misalnya `/?v=2`) untuk melihat yang terbaru.

## Design system

Strukturnya mengikuti dokumentasi publik **Asphalt Aloha** (Gojek), dengan warna dan identitas Lapo Doli. Token ada di bagian akhir `style.css`.

| Bagian | Nilai |
|---|---|
| Jarak | kelipatan 4px (`--sp-1` sampai `--sp-10`) |
| Huruf | Figtree 400, 600, 700, tanpa miring. Skala 12, 14, 16, 20, 26, 34, 44 px (dasar 12 dikali 1,3, tinggi baris kelipatan 4) |
| Warna | token peran: `--fill-*`, `--border-*`, `--text-*`, `--icon-*`. Latar putih, merek merah ulos `#9a3b2f` |
| Bayangan | dua tingkat: `--shadow-low` untuk kartu, `--shadow-high` untuk lapisan melayang |
| Komponen | Button (48 dan 36px), Input Field (48px, admin 40px), Card (garis 1px), Badge, Alert, Toast, Divider |
| Pemisah | jarak lebih dulu, garis seperlunya |

Yang **tidak** tertulis di dokumentasi publik Asphalt (ukuran tombol, radius sudut, nilai bayangan) adalah keputusan proyek ini. Font Maison Neue milik Gojek berlisensi komersial, jadi dipakai Figtree (OFL) sebagai padanan. Hijau Gojek tidak dipakai. Aksen ulos hanya di header.

## Jadwal buka PO

Di tab **PO** admin, isi kolom waktu (opsional) saat menambah PO untuk menjadwalkannya. PO terjadwal belum bisa dipesan (server juga menolak sebelum waktunya), dan layar toko menampilkan "PO segera dibuka" dengan tanggal dan jam bukanya serta tombol "Ingatkan saya" lewat WhatsApp. Tombol **Buka sekarang** membukanya lebih awal. Perlu menjalankan ulang `supabase/schema.sql`.

## Bukti bayar

Foto bukti bayar disimpan di bucket **privat** `proofs` (maksimal 4 MB, hanya JPEG, PNG, atau WebP). Pembeli hanya bisa menambah berkas dan mengaitkannya ke pesanannya sendiri lewat nomor HP yang sama. Hanya admin yang bisa melihatnya: tanda "Ada bukti" muncul di daftar pesanan, dan tombol **Lihat bukti** di detail pesanan membuka fotonya. Semua ini dibuat oleh `supabase/schema.sql`, jadi jalankan ulang file itu sesudah update.

## Font

Fredoka, Geist, dan Geist Mono (lisensi SIL OFL) disajikan dari `assets/fonts/`, tanpa Google Fonts.

## Analitik (opsional)

`index.html` memuat `/_vercel/insights/script.js`. Aktifkan **Web Analytics** di dashboard Vercel (tab Analytics) supaya data pengunjung terkumpul. Tanpa itu, skripnya diabaikan.

## Belum ada

- Captcha untuk pembuatan pesanan. Saat ini pesanan dibatasi 5 kali per 10 menit per nomor HP. Captcha yang benar butuh pengecekan token di server (Supabase Edge Function), jadi perlu akun Cloudflare Turnstile.
- Kalau nanti pakai domain sendiri, ganti `https://lapo-doli.vercel.app` di `index.html` (canonical dan og tags) dengan domain itu.

## Perbaikan sisi pembeli

- Batas bayar 1 jam tampil di layar pembayaran, dengan hitung mundur dan peringatan bila lewat.
- Menu disimpan di browser: dibuka tanpa jaringan tetap tampil, dan layar galat muncul maksimal 8 detik.
- Sisa waktu PO tampil di kartu toko (jadi merah di bawah 2 jam).
- Jumlah item bisa diubah langsung di halaman pesanan.
- Tombol "Pesan seperti sebelumnya" mengisi ulang keranjang terakhir.
- Lembar pilihan menjaga fokus keyboard, semua tombol minimal 44px.
- Link status pesanan: `/?cek=NOMOR` membuka Bantuan dan langsung mencari.
- Tombol bawah di checkout memakai kapsul yang sama dengan keranjang.
- Pembeli bisa membatalkan pesanan sendiri di halaman bayar selama belum ada bukti bayar (`cancel_orders`, skema v13).

## Pilih alamat dari Google Maps

Di halaman pesanan, pembeli yang memilih "Antar" bisa mencari alamat lewat Google Maps. Pilihan mengisi alamat dan wilayah otomatis, dan tautan peta ikut tersimpan di pesanan (tombol "Buka peta" di detail pesanan admin). Alamat di luar Jakarta ditolak.

Aktifkan dengan satu kunci:

1. Di Google Cloud Console buat project, aktifkan **Places API (New)**, dan pasang billing (ada kuota gratis bulanan).
2. Buat **API key**. Batasi di bagian *Application restrictions* ke **Websites** dengan alamat `https://lapo-doli.vercel.app/*` (tambah domain lain jika ada), dan di *API restrictions* hanya **Places API (New)**.
3. Isi `GOOGLE_MAPS_KEY` di `config.js`. Kunci browser memang terlihat publik, karena itu pembatasan domain wajib.
4. Jalankan ulang `supabase/schema.sql` (v14) untuk kolom `maps_url`.

Tanpa kunci, kolom pencarian tersembunyi dan pembeli mengetik alamat seperti biasa. Pasang juga pagu anggaran (budget alert) di Google Cloud supaya biaya tidak mengejutkan.

## Fitur admin

- **Pesanan**: cari (nomor, nama, HP), pilih beberapa lalu konfirmasi bayar sekaligus, tombol Urungkan setelah tiap perubahan status, pesan WhatsApp siap kirim (konfirmasi, minta bukti, sedang diantar, batalkan), Ubah pesanan (nama, HP, alamat, catatan, jumlah item dengan total dihitung ulang di server), Cetak nota.
- **Notifikasi**: bunyi pendek dan jumlah di judul tab saat ada pesanan baru atau bukti bayar masuk. Bunyi bisa dimatikan dengan ikon lonceng. Browser baru berbunyi setelah ada satu ketukan di halaman.
- **Pesanan lewat batas bayar** (1 jam tanpa bukti) diberi tanda dan bisa dibatalkan massal.
- **Rekap dapur**: tautan peta di tiap alamat antar dan tombol "Salin daftar antar untuk kurir".
- **Penjualan**: rentang 4 atau 8 PO terakhir, perbandingan dengan PO sebelumnya, ekspor CSV per PO, dan angka pelanggan berulang yang bisa diklik.
- **Pelanggan**: riwayat pesanan, total belanja, dan catatan per pelanggan.
- **PO**: batas tutup dan kuota khusus per PO, tombol Gandakan ke minggu berikutnya.
- **Menu**: harga berformat ribuan, urutan bisa digeser.
- **Pengaturan**: Aktivitas terbaru (log siapa mengubah apa).

Semua ini memakai skema v15: jalankan ulang `supabase/schema.sql`.

## Batal otomatis

Pesanan web yang belum dikonfirmasi, belum ada bukti bayar, dan sudah lewat 1 jam dibatalkan sistem (`auto_cancel_unpaid`), dicatat di Aktivitas terbaru sebagai "sistem". Pesanan manual dari WhatsApp tidak disentuh. Penjadwalan tiap 5 menit memakai **pg_cron**: aktifkan di Supabase (Database, Extensions, pg_cron) lalu jalankan ulang `supabase/schema.sql` (v16). Tanpa pg_cron, pakai tombol Batalkan di bar "Lewat batas" di tab Pesanan. Pesanan yang batal karena terlambat bayar bisa dibuka lagi admin lewat "Buka lagi".

## Alur pembayaran dan pengecekan (skema v17)

- **Admin, tab Pesanan:** "Bukti masuk" (sudah ada bukti atau klaim transfer) dipisah dari "Belum bayar". Badge sidebar menghitung bukti masuk. Baris menampilkan jumlah transfer persis (total ditambah kode unik).
- **Penampil bukti:** tombol Bukti di baris membuka bukti dengan panah sebelumnya dan berikutnya (keyboard juga), serta tombol Konfirmasi bayar dan Tidak cocok langsung dari sana.
- **Buka lagi** memeriksa kuota dan memberi peringatan (ketuk lagi untuk tetap membuka). **Ubah pesanan lunas** memberi peringatan soal selisih pembayaran.
- **Pesanan lunas yang dibatalkan** ditandai "Perlu refund" sampai admin menekan Tandai sudah refund.
- **Pembeli yang terlambat transfer:** setelah pesanan dibatalkan otomatis, layar status menampilkan "Saya sudah transfer" (fungsi `claim_paid`, dalam 24 jam, sekali). Admin melihat chip "Klaim sudah transfer" di Bukti masuk, pembeli boleh unggah bukti, dan admin memutuskan Buka lagi.
- **Pembatasan penyalahgunaan:** satu nomor HP maksimal 3 pesanan per 10 menit dan 3 pesanan yang masih menunggu bayar sekaligus.
- **Penjualan:** panel Metode bayar (Transfer dan QRIS) dan kolom metode di CSV.
- **Menu:** peringatan bila ada menu tanpa kuota.

## Batas bayar yang bisa diatur dan notifikasi WhatsApp (skema v18)

- **Batas bayar:** diatur di Pengaturan, Batas bayar (15 sampai 240 menit, bawaan 60). Dipakai server untuk batal otomatis dan kuota, dan oleh layar bayar. Pembeli bisa menambah 30 menit satu kali (fungsi `extend_pay`) saat sisa waktu di bawah 20 menit. Tenggat di layar bayar diambil dari server.
- **Notifikasi WhatsApp ke pembeli** (Pengaturan, Notifikasi WhatsApp ke pembeli): pesanan dicatat, pengingat bayar (15 menit sebelum batas), pembayaran diterima, bayar tidak cocok, sedang diantar, dan batal otomatis. Tiap jenis bisa dimatikan. Pesanan manual dari WhatsApp tidak memicu pesan. Satu pesan per checkout, tidak dobel.
- **Cara kerjanya:** pemicu di database mengisi antrean `notify_queue`. Pengiriman memakai ekstensi **pg_net** ke penyedia: **Fonnte** (token) atau **Webhook sendiri** (POST JSON `target`, `message`, `kind`, `ref`, opsional token Bearer). Kunci disimpan di `app_secrets` yang tidak bisa dibaca dari browser. Pengingat dan percobaan ulang berjalan tiap 5 menit lewat pg_cron.
- **Menyalakan:** aktifkan pg_net dan pg_cron di Supabase (Database, Extensions), jalankan ulang `schema.sql`, buka Pengaturan, isi penyedia dan token, tekan Kirim pesan uji, lalu nyalakan saklar. Pesan yang menunggu lebih dari 30 menit dilewati supaya tidak terkirim terlambat.

## Keamanan login admin (skema v19)

- **Siapa admin:** hanya email yang ada di tabel `admins` **dan** punya akun login terverifikasi (`email_confirmed_at` terisi). Orang lain yang masuk dengan emailnya sendiri melihat "Bukan akun admin" dan tidak bisa membaca atau mengubah apa pun: semua tabel, bukti bayar, dan fungsi admin dijaga aturan keamanan database (`is_admin()`).
- **Form login tidak membuat akun baru** (`shouldCreateUser: false`) dan memberi pesan yang sama untuk email dikenal maupun tidak, jadi daftar admin tidak bisa ditebak. Ada jeda 60 detik antar permintaan.
- **Menambah admin baru:** (1) Supabase, Authentication, Users, **Add user** (atau Invite) dengan emailnya; (2) di SQL Editor: `insert into public.admins values ('email@admin.com');`. Urutannya penting karena pendaftaran sendiri ditutup.
- **Pengaturan Supabase yang wajib dicek** (Authentication):
  - Sign In / Providers, Email: matikan **Allow new users to sign up**, dan biarkan **Confirm email** aktif.
  - URL Configuration: isi **Site URL** dengan alamat toko dan batasi **Redirect URLs** hanya ke alamat toko.
  - Matikan penyedia login yang tidak dipakai (misalnya password, Google) kalau tidak perlu.
