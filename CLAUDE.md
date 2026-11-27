# Catatan kerja untuk proyek Lapo Doli

Aturan yang harus diikuti setiap sesi.

## Database (supabase/schema.sql)
- File ini dijalankan ulang di Supabase SQL Editor setiap ada pembaruan, jadi harus aman dijalankan berkali-kali (idempotent).
- **Jangan menambahkan menu "Ayam Napinadar" lagi**, baik di seed `schema.sql` maupun di `DEFAULT_PRODUCTS` di `app.js`. Menu itu sudah dihapus pemilik toko.
- Menu contoh hanya diisi kalau tabel `products` kosong. Jangan memakai `on conflict do nothing` untuk menu, karena menu yang sudah dihapus admin akan muncul lagi.
- Jangan menimpa data yang sudah diubah admin (menu, harga, kuota, pengaturan, PO) lewat `schema.sql`. Perubahan data satu kali ditaruh di file terpisah di `supabase/`.
- Naikkan angka versi di `schema_version()` dan `SCHEMA_VERSION` di `app.js` setiap ada perubahan database yang dibutuhkan fitur baru.

## Tampilan
- Ikuti `DESIGN.md` (judul, ikon, jarak, gerak). Light mode saja, tanpa hitam.
- Naikkan `?v=` pada `style.css` dan `app.js` di `index.html` setiap ada perubahan yang harus sampai ke pengguna.

## Bahasa
- Balasan dan teks antarmuka dalam bahasa Indonesia sehari-hari, tanpa tanda pisah panjang dan tanpa istilah yang terdengar seperti mesin.
