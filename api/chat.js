export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // --- CẤU HÌNH ---
    const GROQ_API_KEY = process.env.GROQ_API_KEY; 
    
    // 👇👇 THÔNG TIN CLOUDFLARE (Điền cứng) 👇👇
    const CF_WORKER_URL = "https://muddy-paper-3417.nhatanhd50.workers.dev/"; 
    const CF_API_KEY = "12345678"; 
    // ------------------------------------------

    try {
        const { message, history, currentSummary } = req.body;

        // ======================================================
        // BƯỚC 1: CHUẨN BỊ DỮ LIỆU (CẮT GỌN)
        // ======================================================

        // Yêu cầu của bạn: Chỉ lấy đúng 2 tin nhắn gần nhất
        // Việc này giúp gói tin siêu nhẹ, phản hồi siêu nhanh
        const tinyHistory = (history || []).slice(-2); 

        // ======================================================
        // BƯỚC 2: TẠO "BỘ NÃO" SUY LUẬN CHO GROQ
        // ======================================================

        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI CAO CẤP (Llama-3 70B).
        
        NHIỆM VỤ: Trả lời câu hỏi của người dùng dựa trên sự SUY LUẬN từ 2 nguồn dữ liệu dưới đây.

        --- NGUỒN 1: BỐI CẢNH DÀI HẠN (Tóm tắt về User) ---
        ${currentSummary ? currentSummary : "Chưa có thông tin gì."}
        ---------------------------------------------------

        --- NGUỒN 2: BỐI CẢNH NGẮN HẠN (Hội thoại vừa xảy ra) ---
        (Được cung cấp ngay sau đây)
        -------------------------------------------------------

        QUY TẮC SUY LUẬN:
        1. LIÊN KẾT DỮ LIỆU: Nếu User hỏi những câu cộc lốc như "Cái đó thế nào?", "Ông ấy bao nhiêu tuổi?", hãy nhìn vào "Bối cảnh dài hạn" để biết "Cái đó" hay "Ông ấy" là ai.
        2. ƯU TIÊN THÔNG TIN MỚI: Nếu thông tin trong "Ngắn hạn" mâu thuẫn với "Dài hạn", hãy ưu tiên thông tin mới nhất.
        3. TRẢ LỜI: Ngắn gọn, đi thẳng vào vấn đề, văn phong tự nhiên tiếng Việt.
        `;

        // ======================================================
        // BƯỚC 3: GỌI GROQ (TRẢ LỜI)
        // ======================================================

        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt }, // Bộ não suy luận
                    ...tinyHistory,                            // 2 câu gần nhất
                    { role: "user", content: message }         // Câu hỏi hiện tại
                ],
                temperature: 0.6, // Độ sáng tạo vừa phải để suy luận logic
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "Xin lỗi, tôi đang suy nghĩ...";

        // ======================================================
        // BƯỚC 4: GỌI CLOUDFLARE (CẬP NHẬT TÓM TẮT)
        // ======================================================
        
        // Nhiệm vụ của Cloudflare là đọc đoạn chat vừa xong và update vào sổ tay
        const updateMemoryPrompt = `
        Nhiệm vụ: Cập nhật hồ sơ người dùng (Memory).
        
        Dữ liệu hiện tại: "${currentSummary || ''}"
        
        Hội thoại mới nhất:
        User: "${message}"
        AI: "${aiReply}"
        
        Yêu cầu:
        1. Đọc hội thoại mới, trích xuất thông tin quan trọng (Tên, nghề, sở thích, sự kiện...).
        2. Gộp thông tin mới vào Dữ liệu hiện tại.
        3. Loại bỏ các thông tin thừa thãi, lặp lại.
        4. Trả về đoạn văn bản tóm tắt hoàn chỉnh.
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Memory", 
                systemPrompt: updateMemoryPrompt, 
                history: [] // Không cần gửi history cho worker tóm tắt
            })
        });

        const cfData = await cfRes.json();
        const newSummary = cfData.response || currentSummary;

        // ======================================================
        // BƯỚC 5: TRẢ KẾT QUẢ
        // ======================================================
        return res.status(200).json({
            response: aiReply,
            newSummary: newSummary
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
