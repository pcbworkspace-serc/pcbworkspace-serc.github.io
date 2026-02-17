import PCBWorkspace from "@/components/PCBWorkspace";
import Inventory from "@/components/Inventory";
import CameraFeed from "@/components/CameraFeed";

const Index = () => {
  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Left Sidebar */}
      <div className="flex flex-col gap-3 p-3 w-[240px] shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2">
          <img src="/serc-robot-transparent.png" alt="SERC Robot" className="h-36 w-36 object-contain" />
          <div>
            <h1 className="font-bold text-2xl leading-tight text-black">Mini MEE</h1>
            <p className="text-sm font-semibold text-black">Be My Engineer!</p>
          </div>
        </div>

        <CameraFeed />
        <Inventory />
      </div>

      {/* Main Workspace */}
      <div className="flex-1 p-3 pl-0">
        <div className="panel-border rounded-lg h-full flex flex-col overflow-hidden" style={{ backgroundColor: "hsla(220, 50%, 8%, 0.9)" }}>
          <h3 className="text-primary font-bold text-center py-2 text-sm border-b border-border">
            PCB Workspace
          </h3>
          <div className="flex-1">
            <PCBWorkspace />
          </div>
        </div>
      </div>

      {/* Logo */}
      <a
        href="https://spaceroboticscreations.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-3 right-3 text-primary text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
      >
        SERC ↗
      </a>
    </div>
  );
};

export default Index;
