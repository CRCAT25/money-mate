export const DEFAULT_CATEGORY_SUGGESTIONS = {
  // Khoản chi
  'ăn uống': ['Ăn sáng', 'Ăn trưa', 'Ăn tối', 'Cà phê', 'Ăn vặt', 'Đi chợ', 'Siêu thị', 'Trà sữa', 'Nhậu'],
  'mua sắm': ['Quần áo', 'Giày dép', 'Mỹ phẩm', 'Đồ gia dụng', 'Phụ kiện', 'Đồ điện tử', 'Sách vở'],
  'xăng xe': ['Đổ xăng', 'Rửa xe', 'Gửi xe', 'Thay nhớt', 'Grab/Taxi', 'Bảo dưỡng xe'],
  'giao thông': ['Đổ xăng', 'Rửa xe', 'Gửi xe', 'Grab/Taxi', 'Vé xe', 'Bảo dưỡng'],
  'cắt tóc': ['Cắt tóc', 'Gội đầu', 'Uốn/nhuộm', 'Làm móng', 'Chăm sóc da', 'Spa'],
  'thể thao': ['Tập gym', 'Cầu lông', 'Bóng đá', 'Chạy bộ', 'Bơi lội', 'Thuê sân', 'Mua đồ thể thao'],
  'y tế': ['Mua thuốc', 'Khám bệnh', 'Nha khoa', 'Thực phẩm chức năng', 'Xét nghiệm', 'Tiêm phòng'],
  'sức khỏe': ['Mua thuốc', 'Khám bệnh', 'Nha khoa', 'Thực phẩm chức năng', 'Bảo hiểm'],
  'nhà cửa': ['Tiền nhà', 'Tiền điện', 'Tiền nước', 'Internet', 'Sửa chữa nhà', 'Đồ dùng nhà cửa'],
  'hóa đơn': ['Tiền điện', 'Tiền nước', 'Internet', 'Điện thoại 4G', 'Phí quản lý', 'Dịch vụ'],
  'giải trí': ['Xem phim', 'Du lịch', 'Game', 'Hội họp bạn bè', 'Sách báo', 'Ca nhạc'],
  'giáo dục': ['Học phí', 'Sách vở', 'Khóa học', 'Đồ dùng học tập', 'Thi chứng chỉ'],
  'ai': ['ChatGPT Plus', 'Claude Pro', 'Cursor', 'GitHub Copilot', 'Midjourney', 'OpenAI API'],
  'tiền nợ': ['Trả nợ', 'Thẻ tín dụng', 'Trả góp', 'Đóng họ', 'Vay mượn'],
  'tiền chung': ['Nộp quỹ', 'Chi chung', 'Mua đồ chung', 'Đi chợ chung'],
  'tiết kiệm': ['Gửi tiết kiệm', 'Mua vàng', 'Tích lũy', 'Đầu tư an toàn'],
  'thú cưng': ['Thức ăn thú cưng', 'Khám thú y', 'Cắt tỉa/tắm', 'Đồ chơi/phụ kiện'],
  'quà tặng': ['Mừng cưới', 'Sinh nhật', 'Thăm hỏi', 'Quà biếu', 'Lì xì'],

  // Khoản thu
  'lương': ['Lương cứng', 'Làm thêm', 'Tăng ca', 'Lương tạm ứng', 'Phụ cấp'],
  'thưởng': ['Thưởng KPI', 'Thưởng lễ tết', 'Thưởng dự án', 'Hoa hồng', 'Thưởng nóng'],
  'đầu tư': ['Cổ phiếu', 'Crypto', 'Lãi tiết kiệm', 'Bất động sản', 'Cổ tức'],
  'khác': ['Thu nợ', 'Quà tặng', 'Bán đồ cũ', 'Hoàn tiền', 'Khoản thu khác'],
};

function normalizeName(name = '') {
  return name.trim().toLowerCase();
}

export function getDefaultSuggestions(name = '') {
  const normalized = normalizeName(name);
  if (!normalized) return [];

  // 1. Khớp chính xác tên
  if (DEFAULT_CATEGORY_SUGGESTIONS[normalized]) {
    return DEFAULT_CATEGORY_SUGGESTIONS[normalized];
  }

  // 2. Khớp từ khóa chứa trong tên
  for (const [key, suggestions] of Object.entries(DEFAULT_CATEGORY_SUGGESTIONS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return suggestions;
    }
  }

  // 3. Khớp một số từ khóa phổ biến
  if (/ăn|uống|food|cafe|cà phê|cơm/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['ăn uống'];
  if (/mua|sắm|shop/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['mua sắm'];
  if (/xe|xăng|xang|đi lại|di lai|di chuyển/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['xăng xe'];
  if (/tóc|toc|làm đẹp|spa/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['cắt tóc'];
  if (/thể thao|gym|bóng|chạy/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['thể thao'];
  if (/thuốc|bệnh|y tế|bác sĩ|nha khoa/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['y tế'];
  if (/nhà|phòng|rent/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['nhà cửa'];
  if (/hóa đơn|điện|nước|internet/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['hóa đơn'];
  if (/lương|salary/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['lương'];
  if (/thưởng|bonus/i.test(normalized)) return DEFAULT_CATEGORY_SUGGESTIONS['thưởng'];

  return [];
}

export function resolveCategorySuggestions(category) {
  if (!category) return [];

  // Ưu tiên subcategories người dùng tự khai báo
  if (Array.isArray(category.subcategories) && category.subcategories.length > 0) {
    return category.subcategories;
  }

  // Nếu chưa khai báo thì dùng gợi ý mặc định theo tên danh mục
  return getDefaultSuggestions(category.name);
}
