# Thư viện Sách Gia đình — Hướng dẫn đưa lên máy chủ (Render)

App web hoàn chỉnh: **đăng ký / đăng nhập qua link, tự lưu trên máy chủ**.
Mở link ra, ai cũng đăng ký tài khoản riêng và đăng nhập được, từ máy nào có mạng cũng thấy kệ sách của tài khoản mình. Không cần Muse sau khi deploy xong.

> Lưu ý: dữ liệu lưu trong file `data.json` trên máy chủ Render (gói Free). Đừng quên Xuất JSON trong app để sao lưu định kỳ. Nếu xóa service Render thì dữ liệu sẽ mất.

## Chuẩn bị

- Tài khoản GitHub (miễn phí): https://github.com
- Tài khoản Render (miễn phí): https://render.com — đăng ký bằng GitHub cho nhanh.
- Máy tính có cài Node.js 18+ và Git (chỉ cần lúc đẩy code lần đầu).

## Bước 1 — Tạo repo GitHub và đẩy code lên

1. Trên GitHub, bấm **New repository**, đặt tên ví dụ `family-library-server`, chọn **Public**, bấm **Create repository**.
2. Trên máy tính, mở Terminal trong thư mục `family-library-server` này rồi chạy:
   ```bash
   git init
   git add .
   git commit -m "Family Library Server"
   git branch -M main
   git remote add origin https://github.com/TEN-CUA-BAN/family-library-server.git
   git push -u origin main
   ```
   Thay `TEN-CUA-BAN` bằng tên GitHub của bạn. Nếu Git hỏi đăng nhập, dùng token GitHub (Settings → Developer settings → Personal access tokens).
3. Kiểm tra trên GitHub đã thấy các file `server.js`, `package.json`, `public/index.html`, `render.yaml` là xong.

## Bước 2 — Tạo Web Service trên Render

1. Vào https://dashboard.render.com → bấm **New +** → **Web Service**.
2. Chọn **Build and deploy from a Git repository** → bấm **Next** → chọn repo `family-library-server` vừa đẩy → **Connect**.
3. Điền như sau:
   - **Name:** `family-library-server`
   - **Region:** Singapore (gần Việt Nam nhất)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
4. Kéo xuống mục **Environment Variables** → bấm **Add Environment Variable**:
   - Key: `JWT_SECRET` — Value: một chuỗi bí mật dài, ngẫu nhiên (ví dụ bấm **Generate** nếu Render có nút này, hoặc tự gõ một chuỗi dài). **Không để trống, không dùng chuỗi mẫu.**
   - `PORT` không cần thêm — Render tự cấp.
5. Bấm **Create Web Service**. Render sẽ build và deploy trong vài phút. Đợi tới khi hiện **Live** màu xanh.

## Bước 3 — Lấy link và chia sẻ cho cả nhà

1. Trên trang service Render, copy địa chỉ ở trên cùng, dạng:
   `https://family-library-server-xxxx.onrender.com`
2. Gửi link này cho cả nhà qua Zalo / Messenger / email.
3. Mỗi người mở link → bấm **Đăng ký** → nhập tên đăng nhập, mật khẩu, tên hiển thị → bấm **Đăng ký** là vào app ngay. Lần sau mở link → **Đăng nhập**.
4. Thêm sách, đổi tiến độ, chấm sao, viết cảm nhận — mọi thứ **tự lưu trên máy chủ**, tắt máy mở máy khác đăng nhập vẫn còn.

> Gói Free của Render: sau khoảng 15 phút không ai mở, máy chủ sẽ "ngủ". Lần mở đầu tiên sau đó có thể chờ 30–60 giây để máy chủ thức dậy, rồi các lần sau sẽ nhanh. Đây là bình thường của gói miễn phí.

## Dùng thử trên máy của bạn trước khi deploy

```bash
npm install
cp .env.example .env   # rồi sửa JWT_SECRET trong .env
node server.js
# Mở http://localhost:3000
```

## Cấu trúc thư mục

- `server.js` — máy chủ Express: đăng nhập, sách, thành viên, wishlist, tra ISBN, xuất/nhập JSON.
- `public/index.html` — giao diện duy nhất (tiếng Việt, ấm cúng).
- `data.json` — dữ liệu thật trên máy chủ (tự tạo khi chạy, không đẩy lên GitHub).
- `render.yaml` — cấu hình Render (dùng Blueprint nếu muốn).
- `package.json` — chỉ dùng `express`, `cors`, `bcryptjs`, `jsonwebtoken`, không cần biên dịch gì thêm.
