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
        // BƯỚC 1: CẮT GỌN LỊCH SỬ
        // ======================================================
        // Chỉ lấy 2 tin nhắn gần nhất để AI tập trung vào hiện tại
        const tinyHistory = (history || []).slice(-2); 

        // ======================================================
        // BƯỚC 2: TẠO "BỘ NÃO" SUY LUẬN & HỎI LẠI (QUAN TRỌNG)
        // ======================================================

        const systemPrompt = `
        BẠN LÀ TRỢ LÝ AI CHUYÊN NGHIỆP (Llama-3 70B).
        
        NHIỆM VỤ: Trả lời User dựa trên dữ liệu dưới đây.

        --- DỮ LIỆU 1: BỐI CẢNH DÀI HẠN (Ký ức về User) ---
        ${currentSummary ? currentSummary : "Chưa có thông tin."}
        ---------------------------------------------------

        --- DỮ LIỆU 2: BỐI CẢNH NGẮN HẠN (Hội thoại vừa xong) ---
        (Được cung cấp ngay sau đây)
        -------------------------------------------------------

        QUY TẮC XỬ LÝ (TUÂN THỦ TUYỆT ĐỐI):
        1. LIÊN KẾT: Trước khi trả lời, hãy rà soát "Bối cảnh dài hạn" xem User đang nói về chủ đề gì (ví dụ: User hỏi "Nó giá bao nhiêu?" -> Kiểm tra xem trước đó có bàn về iPhone hay xe hơi không).
        
        2. HỎI LẠI NẾU MƠ HỒ (QUAN TRỌNG): 
           - Nếu câu hỏi quá ngắn, thiếu chủ ngữ, hoặc không khớp với bất kỳ dữ liệu nào trong ký ức.
           - TUYỆT ĐỐI KHÔNG ĐOÁN MÒ.
           - Hãy hỏi lại User để làm rõ.
           - Ví dụ: User hỏi "Mua ở đâu?", nhưng bạn không biết mua cái gì -> Hãy hỏi: "Dạ, bạn đang muốn hỏi mua sản phẩm nào ạ?"
        
        3. ĐƯA RA GỢI Ý:
           - Nếu thấy User đang phân vân, hãy chủ động đưa ra các lựa chọn dựa trên những gì bạn biết về họ.
           - Ví dụ: "Dựa trên sở thích công nghệ của bạn, tôi gợi ý iPhone 15 hoặc Samsung S24."

        4. Phong cách: Thân thiện, ngắn gọn, Tiếng Việt tự nhiên.
        `;

        // ======================================================
        // BƯỚC 3: GỌI GROQ
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
                    { role: "system", content: systemPrompt }, // Prompt đã nâng cấp
                    ...tinyHistory,                            
                    { role: "user", content: message }         
                ],
                temperature: 0.6, // Giữ mức 0.6 để AI suy luận logic
                max_tokens: 1500
            })
        });

        const groqData = await groqRes.json();
        const aiReply = groqData.choices?.[0]?.message?.content || "Xin lỗi, tôi đang suy nghĩ...";

        // ======================================================
        // BƯỚC 4: GỌI CLOUDFLARE (CẬP NHẬT TÓM TẮT)
        // ======================================================
        
        const updateMemoryPrompt = `
        Nhiệm vụ: Cập nhật hồ sơ người dùng (Memory).
        
        Dữ liệu hiện tại: "${currentSummary || ''}"
        Hội thoại mới: User: "${message}" -> AI: "${aiReply}"
        
        Yêu cầu:
        1. Nếu AI phải hỏi lại User để làm rõ ý (ví dụ: "Ý bạn là gì?"), nghĩa là chưa có thông tin mới -> GIỮ NGUYÊN bản tóm tắt cũ.
        2. Nếu User cung cấp thông tin cụ thể -> CẬP NHẬT vào tóm tắt.
        3. Trả về đoạn văn bản tóm tắt ngắn gọn nhất.
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
                history: [] 
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
