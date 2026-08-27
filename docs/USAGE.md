# VDX Odoo Runner — hướng dẫn sử dụng

VDX Odoo Runner là extension VS Code để chạy và debug Odoo tại máy local, thao tác module, phát hiện addons và kiểm tra mã Python bằng Ruff.

## 1. Chuẩn bị dự án

Một cấu trúc thông dụng:

```text
workspace/
├── .venv/bin/python
├── custom-addons/
│   └── my_module/__manifest__.py
└── .vscode/
    └── settings.json
odoo/
├── odoo-bin
└── config/my-project.conf
```

1. Tạo virtualenv tương thích với phiên bản Odoo.
2. Chuẩn bị PostgreSQL và một database có thể truy cập.
3. Sao chép [`odoo.conf.template`](odoo.conf.template) thành file `.conf` thật.
4. Sửa `addons_path`, thông tin PostgreSQL và `logfile` bằng đường dẫn tuyệt đối.

## 2. Cấu hình bằng GUI

Mở Activity Bar → **Odoo Runner** → **Configure Runner**. Form cấu hình gồm:

- **Python interpreter**: Python trong `.venv` của dự án.
- **Odoo odoo-bin**: file `odoo-bin` của source Odoo.
- **Odoo config**: file `.conf` đã chuẩn bị.
- **Default database**: database mặc định; để trống nếu muốn hỏi mỗi lần.
- **Development mode**: `all`, `reload`, `xml`, `werkzeug`, hoặc `None`.
- **Working directory**: thư mục chạy Odoo, thường là workspace.
- **Disable Pylance**: bật khi dùng Odoo IDE để tránh index trùng.
- **Ruff executable**: đường dẫn Ruff, thường là `.venv/bin/ruff`.
- **Ruff config**: để trống để Ruff tự dò `pyproject.toml`, `ruff.toml` hoặc `.ruff.toml`.

Bấm **Browse…** để chọn file/thư mục hoặc nhập đường dẫn trực tiếp. Bấm **Save Configuration** để lưu vào workspace settings. Extension cũng cập nhật các Python extra paths và tạo/cập nhật `.vscode/launch.json`.

Lệnh **Configure Ruff** sẽ cài Ruff bằng `python -m pip install ruff`, sau đó mở cùng form GUI này.

## 3. Chạy Odoo

Các lệnh có trong Command Palette và Odoo Runner view:

| Lệnh | Tác dụng |
| --- | --- |
| **Odoo: Run** | Chạy server Odoo trong integrated terminal. |
| **Odoo: Debug** | Chạy Odoo bằng Python Debugger (`debugpy`). |
| **Odoo: Update Module** | Chọn module hiện tại, module được phát hiện, hoặc nhập tên thủ công để update. |
| **Odoo: Update Addons Folder** | Update tất cả module trực tiếp trong addons folder của file đang mở. |
| **Odoo: Install Module** | Nhập một hoặc nhiều module để cài đặt. |
| **Odoo: Install Current Module** | Cài module chứa file đang mở. |
| **Odoo: Test Module** | Chạy test cho module nhập thủ công. |
| **Odoo: Test Current Module** | Chạy test cho module chứa file đang mở. |

Các lệnh install/update/test cần database. Nếu chưa cấu hình database mặc định, extension sẽ hỏi trước khi chạy. Test dùng exit code của Odoo; không phân tích nội dung log nên hoạt động ổn định giữa các phiên bản/ngôn ngữ.

## 4. Module discovery

Extension tìm module từ workspace hiện tại và tất cả thư mục trong `addons_path`. Một thư mục được xem là module nếu có `__manifest__.py` hoặc `__openerp__.py`.

Để chạy thao tác current module, hãy mở một file nằm bên trong module đó rồi gọi lệnh tương ứng.

## 5. Ruff

- **Ruff: Configure**: cài Ruff và mở GUI cấu hình.
- **Ruff: Check Current File**: chạy `ruff check` trên file đang mở.
- **Ruff: Check Current Module**: chạy `ruff check` trên module hiện tại.
- Nếu không chỉ định config, Ruff dùng cơ chế tự động dò file cấu hình theo hierarchy của file/module.

## 6. Multi-root workspace

Trong workspace có nhiều folder, extension dùng folder của editor đang active. Vì vậy hãy mở file Odoo trong đúng workspace trước khi chạy Configure, Run, Debug hoặc các lệnh module.

## 7. Xử lý lỗi thường gặp

- **Không tìm thấy Python/Odoo/config**: mở Configure Runner và kiểm tra lại ba đường dẫn bắt buộc.
- **Không thấy module**: kiểm tra `addons_path` và manifest của module.
- **Không kết nối được database**: kiểm tra PostgreSQL, `db_host`, `db_port`, `db_user`, `db_password` và database name.
- **Debug không chạy**: cài Microsoft Python Debugger và chọn đúng Python interpreter.
- **Ruff không cài được**: kiểm tra `pip`, virtualenv và quyền truy cập package index.
- **Không thấy thay đổi sau khi cài VSIX**: chạy `Developer: Reload Window`.

