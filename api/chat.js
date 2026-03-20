// File: api/chat.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    try {
        const { message, history, currentSummary, maxMemoryLength, model, historyLimit } = req.body;

        const targetModel        = model || "llama-3.3-70b-versatile";
        const targetLength       = maxMemoryLength || 2000;
        const targetHistoryLimit = historyLimit || 10;
        const tinyHistory        = (history || []).slice(-targetHistoryLimit);

        // ── BƯỚC 1: CHAT ──────────────────────────────────────────────────

        const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: targetModel,
                messages: [
                    {
                        role: "system",
                        content: `VAI TRÒ: Trợ lý AI Thông Minh & Chuyên Nghiệp.\n\n--- DỮ LIỆU BỘ NHỚ ---\n${currentSummary || "Chưa có dữ liệu."}\n----------------------\n\nQUY TẮC:\n1. [BỘ NHỚ] = những gì User & AI đã nói. [KIẾN THỨC] = hiểu biết về thế giới.\n2. Hỏi quá khứ → nhìn bộ nhớ, trả lời CÓ/CHƯA.\n3. Hỏi kiến thức → trả lời chi tiết.\n4. Phong cách: tự tin, ngắn gọn.`
                    },
                    ...tinyHistory,
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        const chatData = await chatRes.json();
        if (chatData.error) throw new Error(chatData.error.message);

        const aiReplyRaw   = chatData.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời.";
        // Strip <think> để memory không bị bloat — frontend vẫn nhận bản gốc có <think>
        const aiReplyClean = aiReplyRaw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

        // ── BƯỚC 2: MEMORY — đầy đủ cả cặp hội thoại ────────────────────

        const currentBrainSize = (currentSummary || "").length;
        const budgetUsedPct    = Math.round((currentBrainSize / targetLength) * 100);
        const isOverBudget     = currentBrainSize > targetLength;

        // Cặp tin sắp bị đẩy ra — consolidate trước khi mất
        const historyFull    = (history || []).length >= targetHistoryLimit;
        const oldestPair     = historyFull ? (history || []).slice(0, 2) : [];
        const evictedContext = oldestPair.length === 2
            ? `\n\n--- TIN NHẮN SẮP BỊ XÓA (trích thông tin quan trọng trước khi mất) ---\nUser: "${oldestPair[0]?.content}"\nAI: "${(oldestPair[1]?.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim()}"`
            : "";

        const memoryMode = isOverBudget
            ? `KHẨN: bộ não ${currentBrainSize} ký tự, VƯỢT giới hạn ${targetLength}. BẮT BUỘC cắt giảm:\n- USER_PROFILE: tên + nghề + sở thích chính (tối đa 2 dòng)\n- CURRENT_GOAL: 1 câu hoặc để trống\n- KNOWLEDGE_GRAPH: tối đa 8 từ khóa, xóa hết còn lại\n- SHORT_TERM_LOG: tối đa 3 dòng gần nhất, xóa hết còn lại`
            : `CẬP NHẬT: còn ${targetLength - currentBrainSize} ký tự trống.\n- Thêm thông tin mới vào đúng section\n- SHORT_TERM_LOG: tối đa 5 dòng gần nhất\n- Khi còn < 200 ký tự: gộp/cắt log cũ chủ động`;

        let newSummary    = currentSummary;
        let memoryUpdated = true;

        try {
            const memRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: targetModel,
                    temperature: 0.2,
                    max_tokens: 1024,
                    messages: [
                        {
                            role: "system",
                            content: `Bạn là Memory Manager. Giới hạn cứng: ${targetLength} ký tự.\n\nTRẠNG THÁI: ${currentBrainSize}/${targetLength} ký tự (${budgetUsedPct}%).\n${memoryMode}\n\nQUY TẮC:\n1. Output PHẢI <= ${targetLength} ký tự.\n2. Ưu tiên: USER_PROFILE > KNOWLEDGE_GRAPH > log gần > log cũ.\n3. CHỈ trả về 4 section, KHÔNG thêm text nào khác.\n\nFORMAT:\n=== USER_PROFILE ===\n=== CURRENT_GOAL ===\n=== KNOWLEDGE_GRAPH ===\n=== SHORT_TERM_LOG ===`
                        },
                        {
                            role: "user",
                            content: `BỘ NÃO HIỆN TẠI:\n${currentSummary || '(trống)'}${evictedContext}\n\nHỘI THOẠI VỪA XẢY RA:\nUser: "${message}"\nAI: "${aiReplyClean}"\n\nCập nhật bộ não. Output <= ${targetLength} ký tự.`
                        }
                    ]
                })
            });

            const memData = await memRes.json();
            if (memData.error) throw new Error(memData.error.message);

            const memRaw = memData.choices?.[0]?.message?.content || "";
            // Strip <think> khỏi memory output trước khi lưu vào bộ não
            const memContent = memRaw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
            if (memContent) {
                newSummary = memContent.length <= targetLength
                    ? memContent
                    : memContent.slice(0, targetLength);
            } else {
                memoryUpdated = false;
                console.warn("Memory returned empty, keeping old summary.");
            }
        } catch (memError) {
            memoryUpdated = false;
            console.error("Memory update error:", memError.message);
        }

        // ── BƯỚC 3: TRẢ KẾT QUẢ ──────────────────────────────────────────

        return res.status(200).json({
            response: aiReplyRaw,   // Bản gốc có <think> để frontend render collapsible
            newSummary,
            memoryUpdated
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
