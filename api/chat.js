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
        // BƯỚC 1: GROQ (Bộ não) - ĐỌC HIỂU CẤU TRÚC & TRẢ LỜI
        // ======================================================

        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI CAO CẤP.

        --- 🧠 BỘ NHỚ CẤU TRÚC (BRAIN STATE) ---
        ${currentSummary ? currentSummary : "Trạng thái: Chưa có dữ liệu."}
        ----------------------------------------

        NHIỆM VỤ:
        1. Đọc [USER_PROFILE] để điều chỉnh giọng văn và gợi ý phù hợp sở thích.
        2. Đọc [CURRENT_GOAL] để biết User đang muốn gì, tránh lạc đề.
        3. Đọc [KNOWLEDGE_GRAPH] để KHÔNG lặp lại các gợi ý đã đưa ra trước đó.
        4. Trả lời ngắn gọn, tự nhiên. TUYỆT ĐỐI KHÔNG để lộ cấu trúc bộ nhớ này ra cho User thấy.
        `;

        // Lấy 2 tin nhắn gần nhất làm ngữ cảnh ngắn hạn
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
                    { role: "system", content: systemPrompt },
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
        // BƯỚC 2: CLOUDFLARE (Thư ký) - CẬP NHẬT CẤU TRÚC
        // ======================================================
        
        // Đây là Prompt "Kiến trúc sư dữ liệu"
        const updateMemoryPrompt = `
        Bạn là Hệ Thống Quản Lý Trạng Thái (State Manager).
        Nhiệm vụ: Cập nhật cấu trúc dữ liệu JSON-like dựa trên hội thoại mới.

        DỮ LIỆU CŨ: 
        ${currentSummary || '(Trống)'}

        HỘI THOẠI MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        HÃY VIẾT LẠI TOÀN BỘ CẤU TRÚC SAU (Cập nhật thông tin mới vào):

        === USER_PROFILE ===
        (Ghi lại Tên, Tuổi, Sở thích, Ghét gì... Nếu chưa có thì ghi "Chưa có")

        === CURRENT_GOAL ===
        (Chủ đề chính đang bàn là gì? User đang muốn giải quyết vấn đề gì? Ví dụ: Đang tìm khách sạn ở Đà Nẵng)

        === KNOWLEDGE_GRAPH ===
        (Danh sách các thực thể (Địa điểm, Món ăn, Khái niệm) mà AI ĐÃ GỢI Ý. Ghi ngắn gọn để tránh lặp lại sau này)

        === SHORT_TERM_LOG ===
        (Tóm tắt 3-5 dòng sự kiện chính của cuộc hội thoại từ đầu đến giờ. Viết kiểu gạch đầu dòng)

        YÊU CẦU: Giữ nguyên các tiêu đề (=== ... ===). Nội dung bên trong cập nhật thông minh, ngắn gọn.
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Brain State", 
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
