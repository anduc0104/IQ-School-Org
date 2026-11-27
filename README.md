# IQ School Org (static)

Sơ đồ tổ chức IQ School — **frontend tĩnh**, dữ liệu trong `client/public/data/*.json`. Không cần backend / Postgres / đồng bộ iq_system.

> Bản full-stack (Express + Postgres + import) nằm ở nhánh **`with-backend`**.

## Chạy local

```bash
npm --prefix client install
npm run dev
```

Mở http://localhost:5173

## Build & xem bản production

```bash
npm run build
npm run preview
```

Thư mục deploy: `client/dist/` (đã gồm JSON).

## GitHub Pages

1. Push nhánh `main` lên GitHub.
2. Settings → Pages → Source: **GitHub Actions** hoặc **Deploy from branch** (`/docs` hoặc `gh-pages` từ `client/dist`).
3. Nếu dùng project site (`https://user.github.io/repo-name/`):

```bash
# Windows PowerShell
$env:VITE_BASE="/repo-name/"; npm run build
```

Hoặc đặt `base: '/repo-name/'` trong `client/vite.config.ts`.

## Cập nhật dữ liệu JSON

Khi cần snapshot mới từ DB (chỉ trên máy có Postgres + nhánh `with-backend` / DB local):

```bash
# từ nhánh with-backend, hoặc tạm cài pg+dotenv rồi:
npm install dotenv pg   # nếu chưa có
npm run export:data
```

File ghi vào `client/public/data/`:

| File | Nội dung |
|------|----------|
| `nodes.json` | Cây + flat org |
| `employees.json` | Nhân sự + tag node |
| `schools.json` / `classes.json` / `departments.json` | Meta lọc |
| `meta.json` | Thời điểm export |

## Thao tác sơ đồ (giữ Ctrl)

Trên tab **Sơ đồ**:

| Phím | Việc làm |
|------|----------|
| **Ctrl** + lăn chuột | Phóng to / thu nhỏ về phía con trỏ |
| **Ctrl** + kéo nền | Di chuyển toàn bộ sơ đồ (không mất focus node) |
| **Esc** | Thoát focus node / reset view |

Không giữ Ctrl: cuộn bình thường trong danh sách nhân sự / card. Hướng dẫn cũng hiện góc dưới trái khung sơ đồ.

## Lưu ý

- App **chỉ xem** (không sửa node / nhân sự / import).
- JSON public có thể chứa email/SĐT — chỉ publish repo nội bộ / private nếu cần bảo mật.
