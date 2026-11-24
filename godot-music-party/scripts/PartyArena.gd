extends Node3D

@export var player_path: NodePath
@export var tile_size: float = 3.9
@export var tile_gap: float = 4.3

@onready var hud_player: Label = get_node("../HUD/TopBar/HBox/PlayerLabel")
@onready var hud_score: Label = get_node("../HUD/TopBar/HBox/ScoreLabel")
@onready var hud_question: Label = get_node("../HUD/QuestionPanel/VBox/QuestionLabel")
@onready var hud_timer: Label = get_node("../HUD/QuestionPanel/VBox/TimerLabel")
@onready var start_btn: Button = get_node("../HUD/TopBar/HBox/StartPartyBtn")

const TILE_COLORS: Array[Color] = [
	Color(0.957, 0.447, 0.714),
	Color(0.220, 0.741, 0.973),
	Color(0.980, 0.800, 0.082),
	Color(0.204, 0.827, 0.600),
	Color(0.659, 0.333, 0.969),
	Color(0.984, 0.573, 0.235),
	Color(0.133, 0.827, 0.933),
	Color(0.957, 0.247, 0.369),
	Color(0.506, 0.549, 0.973)
]

const QUESTIONS: Array[Dictionary] = [
	{ "q": "高音譜號下加一線是什麼音？", "ans": "C4", "pool": ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5"] },
	{ "q": "1 個升記號（F♯）是什麼大調？", "ans": "G 大調", "pool": ["C 大調", "G 大調", "F 大調", "D 大調", "B♭大調", "A 大調", "E 大調", "E♭大調", "A♭大調"] },
	{ "q": "「Allegro」代表什麼速度？", "ans": "快板", "pool": ["快板", "慢板", "行板", "中板", "急板", "漸強", "漸弱", "斷奏", "漸慢"] },
	{ "q": "C 大三和弦的三個音是？", "ans": "C-E-G", "pool": ["C-E-G", "D-F-A", "E-G-B", "F-A-C", "G-B-D", "A-C-E", "C-F-G", "C-E♭-G", "G-B♭-D"] }
]

var tiles: Array[Dictionary] = []
var phase: String = "idle"
var timer_left: float = 0.0
var current_ans: String = ""
var score: int = 0
var streak: int = 0
var student_name: String = "訪客柴犬"

func _ready() -> void:
	_build_3x3_tiles()
	_load_student_from_web()
	start_btn.pressed.connect(_on_start_party_pressed)
	_refresh_hud()

func _build_3x3_tiles() -> void:
	for r in range(3):
		for c in range(3):
			var idx := r * 3 + c
			var tx := (c - 1) * tile_gap
			var tz := (r - 1) * tile_gap

			var body := StaticBody3D.new()
			body.position = Vector3(tx, 0.22, tz)

			var col := CollisionShape3D.new()
			var shape := BoxShape3D.new()
			shape.size = Vector3(tile_size, 0.45, tile_size)
			col.shape = shape
			body.add_child(col)

			var mesh_inst := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(tile_size, 0.45, tile_size)
			var mat := StandardMaterial3D.new()
			mat.albedo_color = TILE_COLORS[idx % TILE_COLORS.size()]
			mat.roughness = 0.35
			box.material = mat
			mesh_inst.mesh = box
			body.add_child(mesh_inst)

			var lbl := Label3D.new()
			lbl.text = "♪"
			lbl.font_size = 72
			lbl.outline_size = 10
			lbl.position = Vector3(0.0, 0.28, 0.0)
			lbl.rotation_degrees = Vector3(-90.0, 0.0, 0.0)
			body.add_child(lbl)

			add_child(body)
			tiles.append({
				"body": body,
				"col": col,
				"label": lbl,
				"x": tx,
				"z": tz,
				"text": "",
				"dropped": false
			})

func _on_start_party_pressed() -> void:
	if phase == "idle":
		_start_round()
	else:
		_reset_to_idle()

func _start_round() -> void:
	var q: Dictionary = QUESTIONS[randi() % QUESTIONS.size()]
	current_ans = q["ans"]
	phase = "countdown"
	timer_left = 6.5
	hud_question.text = q["q"]

	var labels: Array = q["pool"].duplicate()
	labels.shuffle()
	for i in range(tiles.size()):
		var t: Dictionary = tiles[i]
		t["dropped"] = false
		t["body"].position.y = 0.22
		t["body"].visible = true
		t["col"].disabled = false
		t["text"] = str(labels[i])
		t["label"].text = str(labels[i])
	start_btn.text = "⏹ 結束地磚賽"

func _finish_round() -> void:
	phase = "reveal"
	timer_left = 2.6
	var player := get_node_or_null(player_path) as Node3D
	var safe := false
	for t in tiles:
		if t["text"] != current_ans:
			t["dropped"] = true
			t["col"].disabled = true
		elif player != null:
			if abs(player.global_position.x - t["x"]) <= tile_size * 0.56 and abs(player.global_position.z - t["z"]) <= tile_size * 0.56:
				safe = true
	if safe:
		streak += 1
		score += 150 + streak * 30
		hud_timer.text = "🎉 生存成功！答案：" + current_ans
		_save_score_to_web()
	else:
		streak = 0
		hud_timer.text = "💦 跌落雲海！正確答案：" + current_ans
	_refresh_hud()

func _reset_to_idle() -> void:
	phase = "idle"
	hud_question.text = "按右上角「🎪 開始地磚賽」體驗糖豆人音樂生存戰！"
	hud_timer.text = "WASD 移動 · 空白鍵跳躍 · Shift 飛撲 · 拖曳旋轉視角"
	start_btn.text = "🎪 開始地磚賽"
	for t in tiles:
		t["dropped"] = false
		t["body"].position.y = 0.22
		t["body"].visible = true
		t["col"].disabled = false
		t["label"].text = "♪"

func _process(delta: float) -> void:
	for t in tiles:
		if t["dropped"] and t["body"].position.y > -14.0:
			t["body"].position.y -= delta * 16.0
			if t["body"].position.y < -12.0:
				t["body"].visible = false

	if phase == "countdown":
		timer_left -= delta
		hud_timer.text = "⏱ 剩餘 %.1f 秒 — 快搶佔正確地磚！" % max(0.0, timer_left)
		if timer_left <= 0.0:
			_finish_round()
	elif phase == "reveal":
		timer_left -= delta
		if timer_left <= 0.0:
			_start_round()

func _refresh_hud() -> void:
	hud_player.text = "👤 " + student_name
	hud_score.text = "🏆 分數：%d｜🔥 連勝：%d" % [score, streak]

func _load_student_from_web() -> void:
	if OS.has_feature("web"):
		var raw = JavaScriptBridge.eval("localStorage.getItem('musicGameSettingsV4') || ''")
		if typeof(raw) == TYPE_STRING and raw.length() > 2:
			var parsed = JSON.parse_string(raw)
			if typeof(parsed) == TYPE_DICTIONARY:
				var n: String = str(parsed.get("savedName", ""))
				if n == "__other__":
					n = str(parsed.get("savedCustomName", ""))
				if n != "" and n != "訪客":
					student_name = n

func _save_score_to_web() -> void:
	if OS.has_feature("web") and score > 0:
		var js := "try{localStorage.setItem('godotMusicPartyBest', String(Math.max(%d, Number(localStorage.getItem('godotMusicPartyBest')||0))));}catch(e){}" % score
		JavaScriptBridge.eval(js)
