export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 

    try {
        const { message, history, currentSummary, maxMemoryLength } = req.body;
        const targetLength = maxMemoryLength || 2000;

        // ======================================================
        // BƯỚC 1: GROQ TRẢ LỜI (DÙNG NÃO BỘ + THAM KHẢO CONTEXT)
        // ======================================================
        const tinyHistory = (history || []).slice(-2); 

        const systemPrompt = `
        VAI TRÒ: Trợ lý AI Thông Minh (Llama-3 70B).

        --- 📝 LỊCH SỬ CHỦ ĐỀ ĐÃ NÓI (CONTEXT) ---
        ${currentSummary || "Chưa có."}
        ------------------------------------------

        QUY TẮC:
        1. Context ở trên chỉ là danh sách các từ khóa đã thảo luận.
        2. KHI TRẢ LỜI: Hãy dùng **KIẾN THỨC CỦA CHÍNH BẠN** để giải thích, gợi ý. Đừng chỉ lặp lại Context.
        3. KIỂM TRA TRÙNG LẶP: Nếu trong Context đã có "Phở", và User hỏi "Còn món gì khác?", hãy tự tìm món mới trong đầu bạn (ví dụ: Bún chả) để trả lời.
        `;

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "moonshotai/kimi-k2-instruct-0905",
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
        // BƯỚC 2: CLOUDFLARE TÓM TẮT (DẠNG TỪ KHÓA - KEYWORDS ONLY)
        // ======================================================
        
        const updateMemoryPrompt = `
        Nhiệm vụ: Trích xuất TỪ KHÓA (Keywords Extraction) để lưu vào bộ nhớ.
        Mục tiêu: Ngắn gọn, súc tích, tiết kiệm Token.

        DỮ LIỆU CŨ: 
        ${currentSummary || ''}

        HỘI THOẠI MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        QUY TẮC CẬP NHẬT (NGHIÊM NGẶT):

        1. === KNOWLEDGE_GRAPH ===:
           - CHỈ LƯU DANH TỪ RIÊNG (Địa điểm cụ thể, Tên món ăn).
           - TUYỆT ĐỐI KHÔNG lưu câu văn mô tả (Ví dụ: KHÔNG được ghi "Phở là món ngon...").
           - Định dạng: Liệt kê ngăn cách bằng dấu phẩy.
           - Ví dụ đúng: "Hà Nội, Hồ Gươm, Lăng Bác, Phở, Bún Chả, Đà Nẵng, Cầu Rồng".
           - CỘNG DỒN: Giữ lại từ khóa cũ, thêm từ khóa mới.

        2. === USER_PROFILE ===:
           - Chỉ ghi thông tin cá nhân (Tên, Thích gì, Ghét gì).

        3. === SHORT_TERM_LOG ===:
           - Ghi lại dòng chảy hội thoại theo dạng gạch đầu dòng ngắn gọn.
           - Ví dụ: "- User hỏi ẩm thực HN -> AI gợi ý Phở."

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
                prompt: "Update Compact Memory", 
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
