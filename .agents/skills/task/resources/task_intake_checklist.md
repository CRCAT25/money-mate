# Checklist Thu thập Thông tin cho Task

Dùng checklist này để đối chiếu khi tiếp nhận một yêu cầu:

### 1. Phân loại & Phạm vi
- [ ] Loại task: Tính năng mới / Sửa lỗi / Tối ưu hóa / Đổi giao diện
- [ ] Không gian áp dụng: Cá nhân / Gia đình / Cả hai
- [ ] Người dùng mục tiêu: Tất cả thành viên / Chỉ chủ gia đình / Chỉ người tạo giao dịch

### 2. Dữ liệu & Nghiệp vụ
- [ ] Các trường dữ liệu đầu vào & kiểu dữ liệu
- [ ] Điều kiện ràng buộc (Validation / Min / Max / Nullable)
- [ ] Có ảnh hưởng đến số dư quỹ hay kế hoạch chi tiêu tháng không?
- [ ] Có cần đồng bộ thời gian thực (Socket.io) hoặc cập nhật revision không?

### 3. Giao diện & Trải nghiệm (UI/UX)
- [ ] Vị trí xuất hiện trên giao diện (Trang nào, Modal hay Trang riêng?)
- [ ] Trạng thái Đang tải (Loading skeleton/spinner)
- [ ] Trạng thái Dữ liệu trống (Empty state)
- [ ] Thông báo phản hồi sau khi lưu (Toast success / error)

### 4. Kỹ thuật & Triển khai
- [ ] Database: Có sửa schema trong `server/src/db.js` không? Có cần migration version mới không?
- [ ] Backend: Thêm/sửa route nào trong `server/src/routes/`?
- [ ] Frontend: Sửa component / context nào trong `client/src/`?
- [ ] Kiểm thử: Test case mới trong `server/test/app.test.js`?
