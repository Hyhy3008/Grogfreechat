export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    
    // 👇👇 THÔNG TIN CLOUDFLARE 👇👇
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 
    // --------------------------------

    try {
        const { message, history, currentSummary } = req.body;

        // ======================================================
        // BƯỚC 1: GROQ SUY LUẬN (CRITICAL THINKING MODE)
        // ======================================================

        const systemPrompt = `
        VAI TRÒ: Bạn là Chuyên Gia Tư Vấn AI Cao Cấp.
        
        --- 🧠 BỘ NHỚ TRẠNG THÁI (Đọc kỹ phần này) ---
        ${currentSummary ? currentSummary : "Chưa có dữ liệu."}
        ----------------------------------------------

        QUY TRÌNH TƯ DUY (BẮT BUỘC THỰC HIỆN TRƯỚC KHI TRẢ LỜI):
        
        1. **PHÂN TÍCH [HỒ SƠ USER]:** 
           - Xác định xem User là ai, thích gì? (Ví dụ: Thích rẻ tiền hay sang trọng? Thích khám phá hay nghỉ dưỡng?).
           - Điều chỉnh giọng văn cho phù hợp (Thân thiện hoặc Trang trọng).

        2. **KIỂM TRA [BỐI CẢNH HIỆN TẠI]:**
           - User đang hỏi tiếp nối chủ đề cũ hay chuyển sang chủ đề mới?
           - Nếu User hỏi cộc lốc (ví dụ: "Còn gì nữa không?"), hãy nhìn bối cảnh để hiểu họ đang muốn hỏi thêm về cái gì.

        3. **RÀ SOÁT [DỮ LIỆU ĐÃ CUNG CẤP] (QUAN TRỌNG NHẤT):**
           - Kiểm tra xem mình ĐÃ từng gợi ý cái gì rồi.
           - NGUYÊN TẮC VÀNG: Nếu User hỏi "còn gì khác không", TUYỆT ĐỐI KHÔNG lặp lại những thứ đã liệt kê trong bộ nhớ. Phải tìm kiếm thông tin MỚI.
           - Ví dụ: Bộ nhớ ghi "Đã gợi ý Phở", thì lần này phải gợi ý "Bún chả" hoặc "Bún riêu".

        4. **PHẢN HỒI:**
           - Trả lời ngắn gọn, đi thẳng vào vấn đề.
           - Không cần giải thích quy trình suy nghĩ của bạn, chỉ đưa ra kết quả cuối cùng.
        `;

        // Lấy 2 tin nhắn gần nhất
        const tinyHistory = (history || []).slice(-2); 

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt }, // Groq được dạy tư duy ở đây
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.7, 
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "...";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE TÓM TẮT & SẮP XẾP (STRUCTURING)
        // ======================================================
        
        const updateMemoryPrompt = `
        Bạn là "Memory Librarian" (Thủ thư bộ nhớ). Nhiệm vụ là sắp xếp thông tin gọn gàng.

        DỮ LIỆU CŨ: 
        "${currentSummary || 'Trống'}"

        HỘI THOẠI MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        YÊU CẦU CẬP NHẬT:
        1. [HỒ SƠ USER]: Cập nhật nếu có thông tin cá nhân mới.
        2. [BỐI CẢNH]: Cập nhật chủ đề đang bàn thảo hiện tại.
        3. [DỮ LIỆU ĐÃ CUNG CẤP]: 
           - Hãy trích xuất các DANH TỪ RIÊNG (Địa điểm, Tên món ăn, Tên sản phẩm) mà AI vừa đưa ra.
           - CỘNG DỒN vào danh sách cũ.
           - Ví dụ cũ: "Đã gợi ý: Phở". Mới: "Gợi ý: Bún chả". -> Kết quả: "Đã gợi ý: Phở, Bún chả".
        
        OUTPUT FORMAT (Giữ nguyên tiêu đề):
        [HỒ SƠ USER]: ...
        [BỐI CẢNH HIỆN TẠI]: ...
        [DỮ LIỆU ĐÃ CUNG CẤP]: ...
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Memory Structure", 
                systemPrompt: updateMemoryPrompt, 
                history: [] 
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        // ======================================================
        // BƯỚC 3: TRẢ KẾT QUẢ
        // ======================================================
        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
