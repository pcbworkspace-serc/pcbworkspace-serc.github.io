const items = [
  { type: "Resistor", emoji: "⚡" },
  { type: "Diode", emoji: "🔌" },
  { type: "Capacitor", emoji: "🔋" },
  { type: "LED", emoji: "💡" },
  { type: "Transistor", emoji: "🔧" },
  { type: "Channel Port", emoji: "🔗" },
];

export default function Inventory() {
  return (
    <div className="panel-border panel-bg rounded-lg p-3 w-[220px]">
      <h3 className="text-center text-primary font-bold text-lg mb-1">Inventory</h3>
      <p className="text-xs text-muted-foreground text-center mb-3">
        Drag items onto the PCB Board!
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {items.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", item.type)}
            className="w-[90px] h-[50px] bg-secondary rounded cursor-grab active:cursor-grabbing
                       flex flex-col items-center justify-center text-xs font-medium
                       text-secondary-foreground hover:bg-accent transition-colors select-none"
          >
            <span className="text-lg">{item.emoji}</span>
            {item.type}
          </div>
        ))}
      </div>
    </div>
  );
}
