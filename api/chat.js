export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 

    try {
        const { message, history, currentSummary, maxMemoryLength } = req.body;
        const targetLength = maxMemoryLength || 2500; // Tăng nhẹ giới hạn mặc định

        // ======================================================
        // BƯỚC 1: GROQ TRẢ LỜI (GIỮ NGUYÊN)
        // ======================================================
        const tinyHistory = (history || []).slice(-2); 

        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI CAO CẤP.
        --- BỘ NHỚ TRẠNG THÁI ---
        ${currentSummary || "Chưa có dữ liệu."}
        -------------------------
        QUY TẮC:
        1. Dựa vào bộ nhớ để trả lời.
        2. Nếu User hỏi "Tổng kết lại", hãy liệt kê chi tiết các mục trong [KNOWLEDGE_GRAPH].
        3. Trả lời tự nhiên, ngắn gọn.
        `;

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
                temperature: 0.6,
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "...";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE TÓM TẮT (CÓ BẢO VỆ DỮ LIỆU)
        // ======================================================
        
        const updateMemoryPrompt = `
        VAI TRÒ: Bạn là Quản Trị Viên Cơ Sở Dữ Liệu (Database Admin).
        NHIỆM VỤ: Hợp nhất thông tin mới vào bộ nhớ cũ mà KHÔNG ĐƯỢC LÀM MẤT DỮ LIỆU CHI TIẾT.

        DỮ LIỆU CŨ: 
        ${currentSummary || ''}

        HỘI THOẠI MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        QUY TẮC CẬP NHẬT CỐT TỬ (BẮT BUỘC TUÂN THỦ):

        1. === KNOWLEDGE_GRAPH === (QUAN TRỌNG NHẤT):
           - Đây là kho chứa danh từ riêng (Địa điểm, Món ăn, Tên người...).
           - NGUYÊN TẮC: CỘNG DỒN (APPEND ONLY).
           - Tuyệt đối KHÔNG xóa các từ khóa đã có trong DỮ LIỆU CŨ (ví dụ: Phở, Hạ Long, Hồ Gươm...).
           - Nếu hội thoại mới không nhắc đến địa điểm nào, hãy CHÉP Y NGUYÊN danh sách cũ xuống.
           - Chỉ thêm từ khóa mới nếu có.

        2. === USER_PROFILE ===:
           - Giữ nguyên thông tin cũ. Chỉ cập nhật nếu User sửa lại thông tin cá nhân.

        3. === CURRENT_GOAL ===:
           - Cập nhật trạng thái hiện tại của cuộc trò chuyện.

        4. === SHORT_TERM_LOG ===:
           - Tóm tắt diễn biến mới nhất.

        YÊU CẦU ĐỘ DÀI: Tổng cộng không quá ${targetLength} ký tự.
        
        OUTPUT FORMAT (Giữ nguyên tiêu đề):
        === USER_PROFILE ===
        === CURRENT_GOAL ===
        === KNOWLEDGE_GRAPH ===
        === SHORT_TERM_LOG ===
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Protected Memory", 
                systemPrompt: updateMemoryPrompt, 
                history: [] 
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
