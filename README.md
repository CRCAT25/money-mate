# MoneyMate

MoneyMate là web app quản lý tài chính chung cho hai thành viên trong gia đình. Ứng dụng dùng giao diện mobile-first, hỗ trợ tiếng Việt, cập nhật thời gian thực và chạy cục bộ với SQLite nên không cần cài MongoDB.

## Tính năng

- Đăng ký, xác nhận email, đăng nhập JWT access/refresh token, quên và đặt lại mật khẩu.
- Tạo gia đình hoặc tham gia bằng mã mời; phân quyền chủ gia đình và thành viên.
- Theo dõi thu, chi, số dư, giao dịch gần đây và cơ cấu chi tiêu theo tháng.
- Tạo, sửa, xóa giao dịch; gán giao dịch cho một trong hai thành viên.
- Quản lý danh mục dùng chung với biểu tượng, màu sắc và bảo vệ lịch sử giao dịch.
- Báo cáo tháng, biểu đồ xu hướng 6 tháng, lọc theo thành viên/danh mục và xuất CSV.
- Quản lý tên, email có xác nhận lại, ảnh đại diện, thành viên, loại tiền, ngôn ngữ, mật khẩu và tài khoản.
- Gửi Web Push khi thành viên khác thêm khoản chi trong không gian Gia đình.
- Đồng bộ bằng Socket.IO khi chạy local và revision cache khi chạy trên Vercel serverless.

## Công nghệ

- Frontend: React 19, Vite, Tailwind CSS, Recharts, Lucide, Axios.
- Backend: Node.js, Express, SQLite local, PostgreSQL/Neon production, JWT, bcrypt, Socket.IO, Web Push.
- Kiểm thử API: Node test runner và Supertest.

## Chạy cục bộ

Yêu cầu Node.js 22.5 trở lên (khuyến nghị Node.js 24 LTS hoặc mới hơn).

```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed
npm run dev
```

Mở `http://localhost:5173`. API chạy tại `http://localhost:4000`.

Tài khoản demo sau khi seed:

```text
Email: minh@moneymate.local
Mật khẩu: MoneyMate123!
Mã mời: MATE2026
```

Trong môi trường development, liên kết xác nhận email và đặt lại mật khẩu được trả về giao diện và ghi vào log API. Khi triển khai production, hãy nối một dịch vụ email như Resend, Postmark hoặc Amazon SES tại các điểm tạo link trong `server/src/routes/auth.js`.

## Lệnh hữu ích

```bash
npm run dev       # Chạy frontend và backend
npm run seed      # Tạo lại gia đình và dữ liệu demo
npm test          # Chạy integration tests của API
npm run build     # Build frontend production
npm run check     # Chạy test và build
```

## Cấu trúc

```text
client/           React + Vite application
  src/components  Thành phần giao diện dùng lại
  src/context     Auth, family data, realtime và toast
  src/pages       Authentication và 5 màn hình chính
server/           Express API
  src/routes      Auth, transactions, categories, reports, family, users
  src/db.js       SQLite schema và migration
  src/seed.js     Dữ liệu demo
  test/           Integration tests
```

## Triển khai

Project đã có `vercel.json` để deploy frontend và Express API chung một domain. Production hiện chạy tại:

```text
https://moneymate-theta.vercel.app
```

Vercel project dùng Neon PostgreSQL thông qua `DATABASE_URL`. Các biến bắt buộc khác gồm `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AUTH_LINK_MODE`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` và `VAPID_SUBJECT`. Chạy deploy mới bằng:

```bash
vercel deploy --prod
```

SQLite vẫn được dùng mặc định khi phát triển local. Khi `DATABASE_URL` tồn tại, backend tự chuyển sang PostgreSQL và tự chạy schema migration. Vercel không hỗ trợ Socket.IO lâu dài nên client kiểm tra revision khi chuyển trang hoặc sau hoạt động API; Web Push đảm nhiệm thông báo khoản chi khi app chạy nền hoặc đã đóng.

Trên iPhone/iPad, người dùng cần thêm MoneyMate vào màn hình chính rồi bật thông báo trong Hồ sơ. Android và desktop có thể cấp quyền trực tiếp từ trình duyệt hỗ trợ Web Push.

## Ghi chú bảo mật

- Mật khẩu được băm bằng bcrypt với cost 12.
- Refresh token được băm trước khi lưu và tự xoay vòng khi refresh.
- API xác thực family scope cho mọi dữ liệu giao dịch và danh mục.
- Auth endpoints có rate limit; body JSON giới hạn 1 MB; dữ liệu đầu vào được kiểm tra bằng express-validator.
- Không commit file `.env`, database SQLite hoặc secret lên git.
