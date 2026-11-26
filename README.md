# IQ School Org

Hệ thống cây phân tầng quản trị IQ School (React + Mermaid + PostgreSQL).

## Chạy nhanh

1. Postgres container (đã tạo): `iq-diagram-postgres` port **5433**
2. Cài dependency: `npm install` và `npm --prefix client install`
3. Seed + import từ `iq_dotnet_api`: `npm run import:source`
4. Dev: `npm run dev`
   - API: http://localhost:5050
   - UI: http://localhost:5173

## Tính năng MVP

- Sơ đồ org từ draw.io (HĐQT → … → Luồng 1–4 → phòng ban)
- Click node: thêm node con, thêm nhân sự, sửa/xóa, đổi màu (+ cascade)
- Hover node: xem nhân sự mà không vẽ tên lên cây
- Danh sách nhân sự + tag màu nhiều phòng ban + field lớp
- Import Excel + đồng bộ từ DB `iq_dotnet_api`

## Excel import

Cột gợi ý: `name` / `Họ tên`, `email`, `phone`, `main_class` / `Lớp`, `departments` / `Phòng ban` (nhiều giá trị cách bởi `,`).
