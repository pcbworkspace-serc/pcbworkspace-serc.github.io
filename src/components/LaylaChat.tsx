import { useState, useRef, useEffect } from "react";

const LaylaChat = () => {
  const [minimized, setMinimized] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "bot", text: "Hi! I am Layla. I'm ready to help with your PCB assembly!" }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, minimized]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Add user message
    const newMessages = [...messages, { role: "user", text: input }];
    setMessages(newMessages);
    setInput("");

    // Simulate bot response
    setTimeout(() => {
      setMessages([...newMessages, { role: "bot", text: "I'm processing that request for your PCB workspace..." }]);
    }, 600);
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
              <div key={i} className={`${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <span className={`inline-block p-2 rounded-lg ${m.role === 'user' ? 'bg-[#00a3ff]/20 text-[#00a3ff]' : 'bg-white/5 text-white/90'}`}>
                  {m.text}
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
              placeholder="Type a message..." 
            />
            <button 
              onClick={handleSend}
              className="bg-[#00a3ff] text-black font-bold px-3 py-1 rounded-lg text-[10px]"
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