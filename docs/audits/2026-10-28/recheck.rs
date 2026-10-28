use serde_json::{json,Value};
use galeng_player::Runtime;
fn make(name:&str,start:&str,scenes:Vec<Value>)->std::path::PathBuf{
 let dir=std::path::PathBuf::from(format!("/workspace/galeng-audit/2026-10-28/projects/{name}"));
 std::fs::create_dir_all(dir.join("scenario")).unwrap();
 let mut p:Value=serde_json::from_str(&std::fs::read_to_string("/workspace/galeng-engine/fixtures/explore/project.json").unwrap()).unwrap();p["startScene"]=json!(start);
 std::fs::write(dir.join("galeng.json"),p.to_string()).unwrap();
 for s in scenes{std::fs::write(dir.join("scenario").join(format!("{}.json",s["id"].as_str().unwrap())),s.to_string()).unwrap();}dir
}
fn main(){
 let dir=make("handoff","intro",vec![json!({"id":"intro","beats":[{"say":{"speaker":"n","text":"intro"}}],"exit":{"type":"next","goto":"room"}}),json!({"id":"room","sceneKind":"explore","beats":[]})]);
 let mut r=Runtime::load_dir(dir).unwrap();r.click_advance();println!("K2 dialogue->room: explore={}, phase={:?}",r.uses_explore(),r.view().phase);
 let dlg=json!({"id":"dlg","beats":[{"id":"b0000000000000001","say":{"speaker":"n","text":"line1","voice":"voice/a"}},{"id":"b0000000000000002","say":{"speaker":"n","text":"line2"}}],"exit":{"type":"return"}});
 let room=json!({"id":"room","sceneKind":"explore","onEnter":[{"type":"call","scene":"dlg"}]});
 let dir=make("beatid","room",vec![room,dlg.clone()]);let mut r=Runtime::load_dir(&dir).unwrap();println!("K3 called voice: {:?}",r.view().voice);
 let save=r.try_to_save().unwrap();println!("saved beat_id={:?}",save.beat_id);
 let mut updated=dlg.clone();updated["beats"].as_array_mut().unwrap().insert(0,json!({"id":"b0000000000000003","say":{"speaker":"n","text":"inserted"}}));
 std::fs::write(dir.join("scenario/dlg.json"),updated.to_string()).unwrap();
 r=Runtime::load_dir(&dir).unwrap();r.apply_save(&save).unwrap();r.click_advance();println!("saved b1 after inserting predecessor, next line={:?} (expected line2)",r.view().say_text);
 let dir=make("bgm","room",vec![json!({"id":"room","sceneKind":"explore","onEnter":[{"type":"bgm","asset":"bgm/a"}],"hotspots":[{"id":"desk","name":"Desk","shape":{"type":"rect","x":0,"y":0,"w":50,"h":50}}],"interactions":[{"hotspot":"desk","on":{"verb":"look"},"rules":[{"when":[],"do":[{"type":"bgm","asset":"bgm/b"}]}]}]})]);
 let mut r=Runtime::load_dir(dir).unwrap();let save=r.try_to_save().unwrap();r.select_verb(Some("look"));r.interact_hotspot("desk");r.apply_save(&save).unwrap();println!("load bgm/a save after bgm/b: {:?}",r.view().bgm);
 let dir=make("loop","solo",vec![json!({"id":"solo","beats":[{"set":{"score":"+1"},"say":{"speaker":"n","text":"{score}"}}],"exit":{"type":"next","goto":"solo"}})]);
 let mut r=Runtime::load_dir(dir).unwrap();r.click_advance();println!("K4 one-beat self-loop score={:?} (expected 2)",r.vars().get("score"));
}
