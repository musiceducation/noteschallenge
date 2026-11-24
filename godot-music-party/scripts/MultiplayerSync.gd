extends Node3D

@export var player_path: NodePath
@export var room_code: String = "MUSIC1"
@export var sync_url: String = ""
@export var sync_interval: float = 0.45

var client_id: String = ""
var player_name: String = "Godot柴犬"
var http: HTTPRequest
var timer: float = 0.0
var in_flight: bool = false
var remote_nodes: Dictionary = {}

func _ready() -> void:
	client_id = "gd_%d_%d" % [Time.get_ticks_msec(), randi() % 99999]
	_read_web_config()
	http = HTTPRequest.new()
	http.timeout = 4.0
	add_child(http)
	http.request_completed.connect(_on_sync_completed)

func _read_web_config() -> void:
	if OS.has_feature("web"):
		var raw = JavaScriptBridge.eval("localStorage.getItem('musicGameSettingsV4') || ''")
		if typeof(raw) == TYPE_STRING and raw.length() > 2:
			var parsed = JSON.parse_string(raw)
			if typeof(parsed) == TYPE_DICTIONARY:
				var n: String = str(parsed.get("savedName", ""))
				if n == "__other__":
					n = str(parsed.get("savedCustomName", ""))
				if n != "" and n != "訪客":
					player_name = n
		if sync_url == "":
			var base = JavaScriptBridge.eval("(window.MUSIC_APP_AUTH && window.MUSIC_APP_AUTH.authApiBase) || ''")
			if typeof(base) == TYPE_STRING and base != "":
				sync_url = base.rstrip("/") + "/world/sync"

func _process(delta: float) -> void:
	for id in remote_nodes.keys():
		var info: Dictionary = remote_nodes[id]
		var n: Node3D = info["node"]
		n.global_position = n.global_position.lerp(info["target_pos"], min(1.0, delta * 10.0))
		n.rotation.y = lerp_angle(n.rotation.y, info["target_yaw"], min(1.0, delta * 10.0))

	timer += delta
	if timer >= sync_interval and not in_flight:
		timer = 0.0
		_send_sync()

func _send_sync() -> void:
	var p := get_node_or_null(player_path) as Node3D
	if p == null or sync_url == "":
		return
	in_flight = true
	var payload := {
		"room": room_code,
		"id": client_id,
		"name": player_name,
		"skin": 0x38bdf8,
		"x": snappedf(p.global_position.x, 0.01),
		"y": snappedf(p.global_position.y, 0.01),
		"z": snappedf(p.global_position.z, 0.01),
		"yaw": snappedf(p.rotation.y, 0.01),
		"dive": false,
		"emote": ""
	}
	var err := http.request(sync_url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		in_flight = false

func _on_sync_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	in_flight = false
	if response_code != 200:
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.get("ok", false):
		return
	var players = parsed.get("players", [])
	if typeof(players) != TYPE_ARRAY:
		return

	var seen: Dictionary = {}
	for entry in players:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var pid: String = str(entry.get("id", ""))
		if pid == "" or pid == client_id:
			continue
		seen[pid] = true
		var pos := Vector3(float(entry.get("x", 0.0)), float(entry.get("y", 0.5)), float(entry.get("z", 12.0)))
		var yaw := float(entry.get("yaw", 0.0))
		if not remote_nodes.has(pid):
			var avatar := _spawn_remote_avatar(str(entry.get("name", "同學")))
			avatar.global_position = pos
			add_child(avatar)
			remote_nodes[pid] = { "node": avatar, "target_pos": pos, "target_yaw": yaw }
		else:
			remote_nodes[pid]["target_pos"] = pos
			remote_nodes[pid]["target_yaw"] = yaw

	for id in remote_nodes.keys():
		if not seen.has(id):
			remote_nodes[id]["node"].queue_free()
			remote_nodes.erase(id)

func _spawn_remote_avatar(label_text: String) -> Node3D:
	var root := Node3D.new()
	var mesh_inst := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.55
	cap.height = 1.5
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.22, 0.74, 0.97)
	mat.roughness = 0.4
	cap.material = mat
	mesh_inst.mesh = cap
	mesh_inst.position.y = 0.8
	root.add_child(mesh_inst)

	var lbl := Label3D.new()
	lbl.text = label_text
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.font_size = 42
	lbl.outline_size = 8
	lbl.position = Vector3(0.0, 2.2, 0.0)
	root.add_child(lbl)
	return root
