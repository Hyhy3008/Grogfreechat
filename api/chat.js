export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 

    try {
        const { message, history, currentSummary, maxMemoryLength } = req.body;
        const targetLength = maxMemoryLength || 2000;

        // ======================================================
        // BƯỚC 1: GROQ TRẢ LỜI (ĐÃ SỬA: TĂNG ĐỘ TỰ TIN)
        // ======================================================
        const tinyHistory = (history || []).slice(-2); 

        const systemPrompt = `
        VAI TRÒ: Trợ lý AI Thông Minh (Llama-3 70B).

        --- 📝 DỮ LIỆU BỘ NHỚ (SỰ THẬT TUYỆT ĐỐI) ---
        ${currentSummary || "Chưa có."}
        ----------------------------------------------

        QUY TẮC XỬ LÝ:
        1. **KIỂM TRA TRÍ NHỚ:** Nếu User hỏi "Tôi đã hỏi về cái gì?", "Tôi có nhắc đến X không?":
           - Hãy nhìn ngay vào mục [KNOWLEDGE_GRAPH] hoặc [SHORT_TERM_LOG] ở trên.
           - Nếu từ khóa xuất hiện -> TRẢ LỜI NGAY: "Có, bạn đã hỏi." (Đừng nghi ngờ).
           - Ví dụ: Graph có chữ "Phở". User hỏi "Có bàn về Phở không?". -> Đáp: "Có."

        2. **TRẢ LỜI KIẾN THỨC:**
           - Với các câu hỏi "Ở đó có gì?", "Ăn gì?": Hãy dùng kiến thức của BẠN để trả lời. Bộ nhớ chỉ là để tránh lặp lại.
           - Nếu bộ nhớ đã có "Phở", hãy gợi ý món khác (Bún chả, Bún riêu...).

        3. **THÁI ĐỘ:** Tự tin, khẳng định, không xin lỗi vu vơ.
        `;

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // 👇 Đã sửa lại model chuẩn của Groq để không bị lỗi
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.6, // Giảm nhiệt độ chút để nó bớt "ảo giác"
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "...";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE TÓM TẮT (GIỮ NGUYÊN CODE CỦA BẠN)
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
