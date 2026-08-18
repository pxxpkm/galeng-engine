import { Dialogs } from "./Dialogs";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { Stage } from "./Stage";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { useEditorState } from "./useEditorState";
import "./v2.css";

export function V2App() {
  const ed = useEditorState();
  return (
    <div className="v2">
      <TopBar ed={ed} />
      <div className="v2-main">
        <Sidebar ed={ed} />
        <Stage ed={ed} />
        <Inspector ed={ed} />
      </div>
      <Timeline ed={ed} />
      <Dialogs ed={ed} />
    </div>
  );
}
