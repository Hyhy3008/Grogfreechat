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
        // BƯỚC 1: GROQ TRẢ LỜI
        // ======================================================

        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI (Llama-3 70B).

        --- 📜 NHẬT KÝ TRÒ CHUYỆN (BẮT BUỘC ĐỌC) ---
        ${currentSummary ? currentSummary : "Chưa có lịch sử."}
        ----------------------------------------------

        NHIỆM VỤ:
        1. Khi User hỏi: "Tôi đã hỏi gì?", hãy nhìn vào mục [LỊCH SỬ DIỄN BIẾN] trong nhật ký trên để liệt kê lại các mốc thời gian.
        2. Trả lời câu hỏi hiện tại ngắn gọn, chính xác.
        3. Luôn đối chiếu với Nhật ký để biết User đã đi qua những chủ đề nào (Hà Nội -> Hạ Long...).
        `;

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
                temperature: 0.6,
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "...";


        // ======================================================
        // BƯỚC 2: CLOUDFLARE GHI NHẬT KÝ (LOGGING MODE)
        // ======================================================
        
        // Prompt này ép AI ghi lại HÀNH ĐỘNG của User theo trình tự thời gian
        const updateMemoryPrompt = `
        Bạn là Thư Ký Ghi Biên Bản. Nhiệm vụ là tóm tắt lại dòng chảy câu chuyện.

        DỮ LIỆU CŨ: 
        "${currentSummary || ''}"

        SỰ KIỆN MỚI: 
        User: "${message}" -> AI: "${aiReply}"

        YÊU CẦU CẬP NHẬT (QUAN TRỌNG):
        1. [HỒ SƠ USER]: Ghi lại tên, tuổi, sở thích (nếu có).
        2. [LỊCH SỬ DIỄN BIẾN]: Đây là phần quan trọng nhất. Hãy liệt kê các hành động của User theo gạch đầu dòng.
           - Nếu User hỏi về Hà Nội -> Ghi: "- User hỏi về du lịch Hà Nội."
           - Nếu User hỏi về Hạ Long -> Ghi tiếp: "- User chuyển sang hỏi về Hạ Long."
           - KHÔNG ĐƯỢC XÓA CÁC DÒNG CŨ. Chỉ viết tiếp xuống dưới.
           - Giới hạn: Chỉ giữ lại khoảng 5-7 mốc sự kiện chính quan trọng nhất.
        3. [KIẾN THỨC ĐÃ CUNG CẤP]: Ghi ngắn gọn các địa điểm/món ăn AI đã gợi ý.

        VÍ DỤ OUTPUT CHUẨN:
        [HỒ SƠ USER]: Chưa có thông tin.
        [LỊCH SỬ DIỄN BIẾN]:
        - User chào hỏi.
        - User hỏi kinh nghiệm du lịch Hà Nội.
        - User hỏi tiếp về Vịnh Hạ Long.
        [KIẾN THỨC ĐÃ CUNG CẤP]: Đã gợi ý Phở, Hồ Gươm (HN); Vịnh, Kayak (Hạ Long).
        `;

        const cfRes = await fetch(CF_WORKER_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${CF_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: "Update Diary", 
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
