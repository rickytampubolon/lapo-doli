# Design system Lapo Doli

Satu aturan untuk sisi pembeli dan admin. Semua nilai ada di `style.css` sebagai token di blok "design system" paling bawah. Kalau menambah tampilan baru, pakai token ini, jangan menulis angka sendiri.

## Prinsip

1. **Sederhana dulu.** Satu halaman, satu tugas. Hapus teks dan hiasan yang tidak membantu.
2. **Hangat, bukan hitam.** Light mode saja. Latar putih, krem hangat untuk header pembeli dan sidebar admin, aksen merah bata.
3. **Ringkas.** Tidak ada ruang kosong besar. Satu baris untuk satu hal.
4. **Konsisten.** Hal yang sama selalu terlihat sama di pembeli dan admin.

## Warna

| Peran | Token | Nilai |
|---|---|---|
| Aksen (tombol, tautan, ikon aksi) | `--accent` | `#a64a3d` |
| Aksen kuat (bar bawah, pil aktif) | `--hero` | `#8e4c43` |
| Teks utama | `--text-primary` | `#3b2c27` |
| Teks sekunder | `--text-secondary` | `#6c5d53` |
| Latar halaman | `--bg` | `#ffffff` |
| Latar lembut (kartu info, baris tanggal) | `--soft` | `#f4f2ee` |
| Krem header pembeli dan sidebar admin | `--side-bg` | `#f7efe5` |
| Garis | `--line` | `#e6e2da` |

Aturan: jangan memakai hitam murni. Teks paling gelap adalah `--text-primary`. Status: hijau untuk lunas, amber untuk menunggu, merah bata untuk bahaya.

## Huruf

Satu keluarga: **Figtree**. Hanya tiga bobot: 400 (isi), 600 (label), 700 (judul). Nomor pesanan dan nomor rekening memakai `--mono`.

| Peran | Token | Ukuran / tinggi baris | Bobot | Dipakai untuk |
|---|---|---|---|---|
| Judul halaman | `--t-page` | 17 / 24 | 700 | Judul di header ringkas ("Isi data", "Bayar"), judul halaman admin |
| Judul besar | `--t-title` | 20 / 28 | 700 | Judul halaman Bantuan, layar kosong atau galat |
| Judul bagian (H2) | `--t-h2` | 16 / 24 | 700 | Judul kartu (Pesanan, Cara terima), "Menu untuk ...", judul panel admin |
| Judul item (H3) | `--t-h3` | 15 / 22 | 700 | Nama menu, judul sub-bagian |
| Label | `--t-label` | 14 / 20 | 600 | Label isian, label kelompok, tanggal kirim |
| Isi | `--t-body` | 16 / 24 (HP 17 / 26) | 400 | Teks biasa |
| Isi kecil | `--t-small` | 14 / 20 | 400 | Keterangan, deskripsi |
| Catatan kaki | `--t-cap` | 12 / 16 | 400 | Petunjuk, kesalahan isian, lencana |

Aturan judul:
- Hanya satu `h1` per tampilan, dan di sisi pembeli disembunyikan secara visual (`sr-only`). Judul yang terlihat memakai H2.
- Jangan melompati tingkat (H2 lalu H4).
- Huruf kapital semua tidak dipakai. Gunakan kalimat biasa.
- Jangan mewarnai satu kata di dalam judul. Warna aksen hanya untuk tautan dan tindakan.
- Judul tidak diberi ikon di sebelah kanannya. Ikon di sebelah kiri hanya di kartu bagian (ubin ikon 44px).
- Maksimal satu baris judul. Kalau terlalu panjang, persingkat teksnya.

## Jarak

Kelipatan 4px. Hanya pakai token ini.

| Token | px | Dipakai untuk |
|---|---|---|
| `--sp-1` | 4 | Celah teks dengan keterangan di bawahnya |
| `--sp-2` | 8 | Celah ikon dengan teks, antar baris daftar rapat |
| `--sp-3` | 12 | Celah antar kartu (pembeli dan admin), padding kartu padat, jarak judul ke isi |
| `--sp-4` | 16 | Padding kartu, tepi halaman |
| `--sp-5` | 20 | Celah antar bagian di dalam kartu besar |
| `--sp-6` | 24 | Celah antar bagian halaman |
| `--sp-8` | 32 | Jarak sebelum bagian baru yang berdiri sendiri |
| `--sp-10` | 40 | Ruang bawah halaman |

Aturan:
- **Tepi halaman:** 16px, 14px di lebar di bawah 400px. Semua kartu, pil, dan judul sejajar di tepi yang sama.
- **Kartu:** padding 16px (padat 12px 14px), radius 16px, garis `--line`, bayangan rendah. Judul kartu berjarak 12px dari isinya.
- **Celah antar kartu:** 12px, sama di pembeli dan admin.
- **Judul bagian ke isi:** 8 sampai 12px. **Isi ke judul berikutnya:** 24px.
- **Baris daftar:** padding atas bawah 12px, dipisah garis tipis, bukan kartu baru.
- **Area ketuk minimum 44px** untuk semua tombol. Ukuran tampilan boleh lebih kecil (tombol jumlah 32px) asal area ketuknya diperluas.

Radius: `--r-sm` 8 (isian kecil), `--r-md` 12 (baris info), `--r-lg` 16 (kartu), 999 (pil dan tombol utama).

## Ikon

Gaya: garis (outline), sudut bulat, tebal 1.8, warna mengikuti teks (`currentColor`). Semua ikon ada di sprite di `index.html` dan dipakai dengan `ic("nama")`. Ikon baru harus digambar di kotak 24x24 dengan gaya yang sama.

| Ukuran | Token | Dipakai untuk |
|---|---|---|
| 16 | `--ic-sm` | Di dalam teks 14px atau lebih kecil: lencana, pil tanggal, tautan teks, info kecil |
| 20 | `--ic-md` | Bawaan. Di dalam tombol, daftar, bar, tombol melayang |
| 24 | `--ic-lg` | Tombol ikon di header (kembali, bantuan), ikon di ubin kartu |

Aturan:
- Hanya tiga ukuran. Tidak ada 14, 17, 18, atau 22.
- Ikon sebagai tombol berukuran area ketuk 44px dan wajib punya `aria-label`. Ikon dekoratif memakai `aria-hidden="true"`.
- Warna: `--icon-default` (sekunder) untuk ikon informasi, `--accent` untuk ikon tindakan, putih di atas tombol berisi.
- Jangan pakai emoji sebagai ikon antarmuka. Emoji hanya sebagai cadangan foto menu.
- Ikon tidak berdiri sendiri tanpa teks kecuali sudah umum: kembali, bantuan, bagikan, tutup, salin.

## Komponen inti

- **Tombol utama:** isi `--accent`, teks putih, pil (999px), tinggi 44px. Satu per layar.
- **Tombol garis:** garis `--accent`, teks `--accent`, tinggi 40 sampai 44px. Untuk tindakan kedua ("Tambah menu", "Ubah").
- **Tombol teks:** tanpa garis, bergaris bawah. Untuk tindakan ringan ("Batalkan pesanan").
- **Pil tanggal:** satu baris, tinggi 40px. Aktif: isi `--hero` dan centang.
- **Lencana status:** pil kecil, titik berwarna, teks 12 sampai 14px.
- **Baris tanggal kirim:** latar `--soft`, radius 12px, ikon kalender 20px.
- **Lembar pilihan (sheet):** naik dari bawah, sudut atas 16px, judul H2, tombol utama di dasar.
- **Header pembeli:** beranda memakai header penuh (logo, nama, bantuan). Halaman Data dan Bayar memakai baris tipis 52px (kembali, judul halaman, bantuan). Pita ulos hanya di header.
- **Admin:** sidebar krem di layar lebar, tab di layar sempit. Panel memakai aturan kartu yang sama. Daftar data dibuat sebagai baris, bukan kartu bersarang.

## Beda pembeli dan admin

| | Pembeli | Admin |
|---|---|---|
| Kepadatan | Longgar, satu tugas per layar | Padat, banyak data dalam satu layar |
| Celah antar kartu | 12px | 12px (sama) |
| Lebar isi | Maksimal 560px, di tengah | Penuh, dengan sidebar |
| Judul bagian | H2 16/700 | H2 16/700 (sama) |
| Ikon | 20px, header 24px | 20px, tombol tindakan baris 16px |
| Bahasa | Sapaan ramah, kalimat pendek | Singkat, langsung ke data |

## Menulis teks antarmuka

- Bahasa Indonesia sehari-hari. Kalimat biasa, tidak kaku.
- Tombol memakai kata kerja yang jelas: "Pesan dan lanjut bayar", "Unggah bukti bayar".
- Satu tindakan, satu nama di seluruh alur. Tombol "Ubah" menghasilkan pesan yang menyebut "diubah".
- Galat menjelaskan apa yang terjadi dan apa yang harus dilakukan. Tidak meminta maaf berlebihan.
- Hindari tanda pisah panjang dan istilah teknis.

## Menambah atau mengubah tampilan

1. Cari dulu komponen yang sama di daftar di atas dan pakai ulang.
2. Pakai token huruf, jarak, dan ikon. Jangan menulis `font-size`, `padding`, atau ukuran ikon dengan angka sendiri.
3. Tes di lebar 360, 390, dan desktop. Pastikan tepi kiri dan kanan sejajar dan tidak ada geser horizontal.
4. Naikkan nomor `?v=` pada `style.css` dan `app.js` di `index.html` setiap kali ada perubahan yang perlu sampai ke pengguna.

## Ukuran di HP

Di layar sampai 640px token huruf naik satu langkah supaya nyaman dibaca: judul halaman 18, judul besar 22, H2 dan H3 17, label dan isi kecil 15, catatan kaki 13, isi 17. Isian formulir 17px agar iPhone tidak memperbesar halaman saat diketuk. Aturan ada di blok "HP" paling bawah `style.css`.
