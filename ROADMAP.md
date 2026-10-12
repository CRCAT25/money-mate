# MoneyMate — Lộ trình phát triển & Dự định sắp tới (Roadmap)

## 📌 Tính năng sắp triển khai (Upcoming Backlog)

### 1. Tự động kết nối SePay Webhook qua SePay API Token (1 chạm)
- **Mục tiêu:** Giảm bớt thao tác copy-paste Webhook URL và API Key thủ công giữa MoneyMate và my.sepay.vn.
- **Cách thức hoạt động:**
  1. Người dùng chỉ cần lấy **API Token** tại mục *API Access* trên [my.sepay.vn](https://my.sepay.vn).
  2. Dán SePay API Token vào MoneyMate trong mục Cài đặt.
  3. Backend MoneyMate tự động gọi API của SePay (`POST https://bankhub-api.sepay.vn/v1/webhook` hoặc Open API SePay):
     - Lấy danh sách tài khoản ngân hàng đã liên kết (Techcombank, Vietcombank...).
     - Tự động tạo cấu hình Webhook trên SePay trỏ về endpoint của MoneyMate.
     - Tự động chọn sự kiện `Có tiền ra` và cấu hình bảo mật `API Key` hoàn toàn tự động.
- **Trạng thái:** Đã lưu vào dự định sắp tới (Backlog).

---

## ✅ Tính năng vừa hoàn thành (Recently Shipped)

- **Tích hợp SePay Webhook tự động ghi nhận chi tiêu (Techcombank & ngân hàng VN):**
  - Webhook an toàn với xác thực API Key, chống trùng lặp giao dịch (Idempotency).
  - Thuật toán gợi ý danh mục thông minh theo nội dung giao dịch (Highlands $\rightarrow$ Cà phê, Grab $\rightarrow$ Giao thông...) và học hỏi theo thói quen phân loại của người dùng.
  - Thông báo đẩy (Web Push) thời gian thực tới điện thoại: *"Bạn vừa chi 55.000đ – thuộc mục nào?"*.
  - Giao diện Banner & Popup phân loại 1 chạm trên trang Home, hỗ trợ chọn không gian ghi nhận (Cá nhân / Gia đình).
