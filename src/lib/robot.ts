// Sends the command from your Website to your local server
export async function askRobotToAssemble(componentID: string) {
  const localUrl = "http://127.0.0.1:5000/execute";

  try {
    const response = await fetch(localUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pick_and_place",
        component: componentID,
      }),
    });

    const data = await response.json();
    console.log("Success:", data.msg);
    return data.msg as string;
  } catch (error) {
    console.error("Connection Error:", error);
    return "Offline: Is the Python server running?";
  }
}

// Interprets user text like: "place r1" / "assemble C5"
export async function handleChatInput(userInput: string) {
  const text = userInput.toLowerCase();

  if (text.includes("place") || text.includes("assemble")) {
    // Find a component name like R1, C5, etc.
    const match = text.match(/[rc]\d+/);
    if (match) {
      const component = match[0].toUpperCase();

      // Await the server and return its message
      const msg = await askRobotToAssemble(component);
      return msg;
    }
  }

  return "I'm not sure which component you mean. Try saying 'Place R1'.";
}
