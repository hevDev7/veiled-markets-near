# Publishing `@veiled-markets/sdk` to npmjs

Step-by-step guide untuk publish SDK ke npm registry. Ikuti urutan persis ini — beberapa step butuh action manual di browser yang tidak bisa diotomasi.

---

## Pre-flight checklist

Verifikasi semua sudah siap sebelum mulai:

```bash
cd sdk
ls README.md LICENSE                    # ✅ kedua file ada
cat package.json | grep -E "(version|license|access)"
npm test                                 # ✅ 191/191 passing
npm pack --dry-run                       # ✅ 7 files, ~82 kB tarball
```

Hasil yang diharapkan dari `npm pack --dry-run`:

```
📦  @veiled-markets/sdk@0.5.0
Tarball Contents
1.1kB LICENSE
13.3kB README.md
63.9kB dist/index.d.mts
63.9kB dist/index.d.ts
102.8kB dist/index.js
96.0kB dist/index.mjs
1.6kB package.json
total files: 7
```

Kalau ada item yang missing, lihat section [Troubleshooting](#troubleshooting) di bawah.

---

## Step 1 — Create npm account (kalau belum ada)

1. Buka https://www.npmjs.com/signup
2. Sign up dengan email + username + password
3. Verify email lewat link yang dikirim ke inbox
4. Enable 2FA di https://www.npmjs.com/settings/~/profile (**wajib** untuk publish package — npm enforces 2FA untuk publish since 2022)

> **2FA wajib untuk scope publish.** Tanpa 2FA, `npm publish` akan reject dengan error `EOTP`. Pakai authenticator app (Authy, Google Authenticator, 1Password) — bukan SMS.

---

## Step 2 — Create npm organization `veiled-markets`

Karena package name `@veiled-markets/sdk` adalah **scoped package**, scope `veiled-markets` harus eksis sebagai npm organization yang Anda owned.

1. Buka https://www.npmjs.com/org/create
2. Organization name: `veiled-markets`
3. Plan: **Unlimited public packages — Free**
4. Submit
5. Anda otomatis jadi owner organization

> **Catatan:** kalau scope `veiled-markets` sudah di-claim orang lain, Anda punya 3 opsi:
> - Pakai personal scope: ubah nama package jadi `@<your-username>/veiled-markets-sdk`
> - Pakai unscoped: ubah jadi `veiled-markets-sdk` (no `@` prefix)
> - Negosiasi transfer dengan owner lama
>
> Per check terakhir saya (lihat session sebelumnya), `@veiled-markets/sdk` returns 404 — belum di-claim, **aman**.

---

## Step 3 — Login ke npm dari terminal

```bash
cd sdk   # dari root repo
npm login
```

Anda akan diminta:
- Username
- Password
- Email
- One-time password (2FA dari authenticator)

Verifikasi login:

```bash
npm whoami
# Should print your npm username
```

---

## Step 4 — Final dry-run

Sebelum publish beneran, run sekali lagi untuk memastikan tarball sudah benar:

```bash
npm pack --dry-run
```

Cek:
- ✅ 7 files dalam tarball
- ✅ Total size ~82 kB (NOT MB)
- ✅ name: `@veiled-markets/sdk`
- ✅ version: `0.5.0`

Kalau Anda paranoid, generate tarball asli dan inspect:

```bash
npm pack                                 # creates veiled-markets-sdk-0.5.0.tgz
tar -tzf veiled-markets-sdk-0.5.0.tgz    # list contents
rm veiled-markets-sdk-0.5.0.tgz          # cleanup
```

---

## Step 5 — Publish

```bash
npm publish
```

Karena `package.json` punya `"publishConfig": { "access": "public" }`, npm tidak akan reject scoped package sebagai private secara default. Tidak perlu `--access public` flag manual.

`prepublishOnly` script di `package.json` akan otomatis run:
1. `npm run build` — rebuild dist/ dari src/ (memastikan tarball sync dengan source terbaru)
2. `npm test` — run 191 tests, gagal kalau ada yang fail

Kalau salah satu gagal, publish akan dibatalkan sebelum tarball di-upload.

Anda akan diminta one-time password (2FA) sekali lagi sebelum upload.

Output yang diharapkan:

```
+ @veiled-markets/sdk@0.5.0
```

---

## Step 6 — Verifikasi hasil

```bash
# Check package muncul di registry
npm view @veiled-markets/sdk
npm view @veiled-markets/sdk version    # should print "0.5.0"

# Browser
open https://www.npmjs.com/package/@veiled-markets/sdk
```

Yang harus terlihat di npm package page:
- ✅ README rendered (full markdown dari README.md Anda)
- ✅ Version 0.5.0
- ✅ MIT License badge
- ✅ Dependencies: `@provablehq/sdk`
- ✅ Last publish time
- ✅ Repository link → github.com/hevDev7/veiled-markets-near (working, not 404)
- ✅ Homepage link → veiledmarkets.xyz

Test install dari registry:

```bash
mkdir /tmp/test-veiled-sdk && cd /tmp/test-veiled-sdk
npm init -y
npm install @veiled-markets/sdk @provablehq/sdk
node -e "const sdk = require('@veiled-markets/sdk'); console.log(Object.keys(sdk).slice(0, 10));"
# Should print: [ 'VeiledMarketsClient', 'createClient', 'PROGRAM_IDS', ... ]
```

Cleanup:

```bash
rm -rf /tmp/test-veiled-sdk
```

---

## Step 7 — Tag git release

Setelah publish berhasil, tag git supaya version di npm cocok dengan commit di repo:

```bash
cd ../          # back to repo root
git tag -a sdk-v0.5.0 -m "Release @veiled-markets/sdk@0.5.0"
git push origin sdk-v0.5.0
```

Atau buat GitHub Release lewat web:
1. Buka https://github.com/hevDev7/veiled-markets-near/releases/new
2. Tag: `sdk-v0.5.0`
3. Title: `@veiled-markets/sdk v0.5.0`
4. Description: ringkasan changelog
5. Publish

---

## Troubleshooting

### `npm publish` reject with "package name too similar"

npm enforces fuzzy matching untuk mencegah typosquatting. Kalau ada package lain yang namanya mirip (e.g. `veiled-market-sdk`, `veiledmarkets`), npm akan reject.

**Fix:** ubah scope (misal `@scope-anda/veiled-markets-sdk`) atau request override via npm support.

### `npm publish` reject with "you do not have permission"

Scope `veiled-markets` tidak Anda own, atau token expired.

**Fix:**
1. `npm whoami` — confirm logged in
2. Visit https://www.npmjs.com/settings/~/orgs — confirm `veiled-markets` listed
3. `npm logout && npm login` — re-auth

### `npm publish` reject with "tarball too large"

Limit npm: 2 MB un-compressed total. Tarball Anda 82 kB, **way under**.

Kalau muncul error ini berarti `dist/` tidak ke-rebuild dengan benar. Check:

```bash
du -h dist/*
```

Setiap file harus < 200 kB. Kalau ada yang > 1 MB, cek webpack/tsup config.

### `EPUBLISHCONFLICT` — version already exists

npm tidak boleh re-publish version yang sama. Setiap publish harus naik version.

**Fix:** bump version di package.json:
```bash
npm version patch    # 0.5.0 → 0.5.1
# atau: npm version minor (0.5.0 → 0.6.0)
# atau: npm version major (0.5.0 → 1.0.0)
```

`npm version` akan otomatis create git commit + tag. Lalu publish ulang.

### `EOTP` — one-time password missing

2FA wajib. Pastikan authenticator app aktif dan masukkan kode saat diminta.

### Test gagal di `prepublishOnly`

Build atau test broken. Run secara terpisah:

```bash
npm run build
npm test
```

Fix issue, commit, baru retry publish.

### README tidak render di npm page

Kemungkinan markdown ada syntax error. Lokal preview:

```bash
# Pakai grip (GitHub-style markdown preview)
pip install grip
grip README.md
# Buka http://localhost:6419
```

Atau test di https://stackedit.io paste isi README.md, lihat preview.

---

## Post-publish — bump version untuk update

Untuk publish update di kemudian hari:

```bash
cd sdk
# 1. Update code, run tests
npm test

# 2. Bump version
npm version patch     # bug fix → 0.5.1
npm version minor     # new feature, backwards-compat → 0.6.0
npm version major     # breaking change → 1.0.0

# 3. Update CHANGELOG.md (optional but recommended)

# 4. Publish
npm publish

# 5. Push git tags
git push origin --tags
```

`npm version` otomatis update `package.json`, create commit, dan tag git — Anda tinggal push.

---

## Recommended next versions

### v0.6.0 — sub-entrypoints (browser/node split)

Tambahkan `exports` field untuk separate browser dan node bundles:

```json
"exports": {
  ".": { ... },
  "./browser": {
    "import": "./dist/browser.mjs",
    "types": "./dist/browser.d.ts"
  },
  "./node": {
    "import": "./dist/node.mjs",
    "types": "./dist/node.d.ts"
  }
}
```

Ini menghilangkan `node:child_process` warning di browser bundles.

### v1.0.0 — stable API

- Lock public API surface
- Pin contract versions in README
- Add CHANGELOG.md dengan migration guide dari 0.x
- Tag mainnet readiness milestone

---

## Quick reference

```bash
# Pre-flight
cd sdk && npm test && npm pack --dry-run

# First publish (needs npm org + 2FA)
npm login
npm publish

# Verify
npm view @veiled-markets/sdk
open https://www.npmjs.com/package/@veiled-markets/sdk

# Update publish
npm version patch
npm publish
git push origin --tags
```
