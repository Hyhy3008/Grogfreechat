// api/chat.js

export default async function handler(req, res) {
    // 1. Chỉ chấp nhận phương thức POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Lấy API Key từ "Két sắt" của Vercel (Biến môi trường)
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Chưa cấu hình API Key trên Vercel' });
    }

    try {
        const { message, history } = req.body;

        // 3. Cấu trúc tin nhắn gửi sang Groq
        // Bao gồm: System prompt + Lịch sử chat cũ + Tin nhắn mới
        const messages = [
            { role: "system", content: "Bạn là trợ lý AI hữu ích, trả lời ngắn gọn bằng tiếng Việt." },
            ...(history || []),
            { role: "user", content: message }
        ];

        // 4. Gọi API của Groq
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // Model nhanh và free
                messages: messages,
                temperature: 0.7,
                max_tokens: 1024
            })
        });

        const data = await response.json();

        // Kiểm tra nếu Groq báo lỗi
        if (data.error) {
            throw new Error(data.error.message);
        }

        // 5. Trả kết quả về cho giao diện (Frontend)
        return res.status(200).json({ response: data.choices[0].message.content });

    } catch (error) {
        console.error("Lỗi:", error);
        return res.status(500).json({ error: "Lỗi xử lý phía Server: " + error.message });
    }
}
