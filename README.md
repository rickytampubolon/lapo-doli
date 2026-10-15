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
