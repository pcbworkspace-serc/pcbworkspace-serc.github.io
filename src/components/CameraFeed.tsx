export default function CameraFeed() {
  return (
    <div className="panel-border panel-bg rounded-lg overflow-hidden w-[220px]">
      <div className="w-full h-[140px] bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-sm">📷 Robot Cam</span>
      </div>
      <p className="text-center text-xs text-muted-foreground py-1">Live Feed</p>
    </div>
  );
}
