export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 

    try {
        const { message, history, currentSummary, maxMemoryLength } = req.body;
        const targetLength = maxMemoryLength || 2500;

        // ======================================================
        // BƯỚC 1: GROQ TRẢ LỜI (SYSTEM PROMPT CHUẨN LOGIC)
        // ======================================================
        const tinyHistory = (history || []).slice(-2); 

        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI THÔNG MINH (Llama-3 70B).

        --- 1. NGỮ CẢNH HỘI THOẠI (CONTEXT MEMORY) ---
        (Đây chỉ là nhật ký những gì User và AI đã nói với nhau. KHÔNG PHẢI LÀ TOÀN BỘ KIẾN THỨC CỦA BẠN)
        ${currentSummary || "Cuộc trò chuyện mới bắt đầu."}
        ----------------------------------------------

        --- 2. QUY TẮC SỬ DỤNG NÃO BỘ (CRITICAL INSTRUCTIONS) ---
        
        A. KHI USER HỎI KIẾN THỨC MỚI (Ví dụ: "Đà Nẵng đi đâu?", "Cách làm món Phở?"):
           - BẮT BUỘC dùng **KIẾN THỨC NỘI TẠI (TRAINING DATA)** của bạn để trả lời.
           - TUYỆT ĐỐI KHÔNG được nói "Trong bộ nhớ không có thông tin này". Bạn là AI, bạn biết cả thế giới, hãy trả lời tự tin.

        B. KHI USER HỎI VỀ QUÁ KHỨ (Ví dụ: "Tôi đã hỏi gì?", "Tôi tên là gì?"):
           - Lúc này mới nhìn vào phần **[1. NGỮ CẢNH HỘI THOẠI]** ở trên để trả lời.
           - Nếu trong Ngữ cảnh có từ khóa (ví dụ: Phở), hãy xác nhận là User đã hỏi.

        C. KHI TRẢ LỜI:
           - Trả lời thẳng vào vấn đề.
           - Không cần giải thích "Dựa trên bộ nhớ..." hay "Dựa trên kiến thức...". Cứ trả lời tự nhiên như người thật.
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
                temperature: 0.7, // Tăng nhẹ để sáng tạo hơn khi trả lời kiến thức mới
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "...";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE CẬP NHẬT KIẾN THỨC MỚI VÀO CONTEXT
        // ======================================================
        
        // Sau khi Groq đã dùng não để trả lời về "Đà Nẵng", 
        // Cloudflare phải nhanh chóng ghi cái kiến thức mới đó vào Context để lần sau Groq nhớ là "Đã nói rồi".
        
        const updateMemoryPrompt = `
        Bạn là Quản Lý Trạng Thái Hội Thoại.

        DỮ LIỆU CŨ: 
        ${currentSummary || ''}

        DIỄN BIẾN MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        NHIỆM VỤ CẬP NHẬT:
        1. === KNOWLEDGE_GRAPH ===:
           - QUAN TRỌNG: Nếu AI vừa đưa ra kiến thức mới (ví dụ: Cầu Rồng, Mỹ Khê...), hãy THÊM NGAY vào danh sách này.
           - Nguyên tắc: CỘNG DỒN (Không xóa cái cũ).

        2. === SHORT_TERM_LOG ===:
           - Ghi lại hành động: "User hỏi về Đà Nẵng -> AI gợi ý Cầu Rồng".

        3. === USER_PROFILE ===: (Giữ nguyên hoặc cập nhật).

        ĐỘ DÀI TỐI ĐA: ${targetLength} ký tự.
        
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
                prompt: "Update Knowledge Context", 
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
