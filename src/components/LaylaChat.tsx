import { useState, useRef, useEffect } from "react";

const LaylaChat = () => {
  const [minimized, setMinimized] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "bot", text: "Hi! I am Layla. I'm ready to help with your PCB assembly!" }
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, minimized]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userText = input.trim();
    const newMessages = [...messages, { role: "user", text: userText }];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    const streamingMessages = [...newMessages, { role: "bot", text: "" }];
    setMessages(streamingMessages);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1000,
          stream: true,
          system: "You are Layla, a helpful AI assistant for SERC's PCB Workspace. You help users with PCB assembly, electronics, and workspace-related questions. Keep responses concise and friendly.",
          messages: newMessages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role === "user" ? "user" : "assistant",
              content: m.text,
            })),
        }),
      });

      if (!response.ok) throw new Error("API error");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let botText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta?.text) {
              botText += parsed.delta.text;
              setMessages([...newMessages, { role: "bot", text: botText }]);
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages([...newMessages, { role: "bot", text: "Sorry, I ran into an error. Please try again!" }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="fixed right-6 bottom-6 z-[9999] flex flex-col items-end">
      {!minimized && (
        <div className="w-[280px] h-[350px] bg-black/95 border border-[#00a3ff]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4 animate-in fade-in slide-in-from-bottom-4 backdrop-blur-md">
          <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
            <span className="text-[10px] font-bold text-[#00a3ff] uppercase tracking-widest">Layla AI</span>
            <button onClick={() => setMinimized(true)} className="text-white/40 hover:text-white transition-colors">✕</button>
          </div>

          <div ref={scrollRef} className="flex-1 p-4 text-[11px] text-white/80 overflow-y-auto space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`${m.role === "user" ? "text-right" : "text-left"}`}>
                <span className={`inline-block p-2 rounded-lg ${m.role === "user" ? "bg-[#00a3ff]/20 text-[#00a3ff]" : "bg-white/5 text-white/90"}`}>
                  {m.text}
                  {isStreaming && i === messages.length - 1 && m.role === "bot" && (
                    <span className="inline-block w-[6px] h-[10px] bg-white/60 ml-0.5 animate-pulse" />
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-white/10 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:border-[#00a3ff]/50"
              placeholder={isStreaming ? "Layla is typing..." : "Type a message..."}
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming}
              className="bg-[#00a3ff] disabled:opacity-40 text-black font-bold px-3 py-1 rounded-lg text-[10px]"
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setMinimized(!minimized)}
        className="bg-[#00a3ff] hover:scale-105 text-white text-[10px] font-bold px-5 py-2.5 rounded-full shadow-xl border border-white/20 transition-all flex items-center gap-2"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        {minimized ? "Ask Layla" : "Close"}
      </button>
    </div>
  );
};

export default LaylaChat;
