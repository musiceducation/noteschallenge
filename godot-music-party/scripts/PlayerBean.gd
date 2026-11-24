extends CharacterBody3D

@export var move_speed: float = 10.5
@export var jump_velocity: float = 10.8
@export var dive_speed: float = 16.5
@export var gravity: float = 28.0
@export var mouse_sensitivity: float = 0.006

@onready var cam_pivot: Node3D = $CamPivot
@onready var visual: Node3D = $Visual

var dive_timer: float = 0.0
var dragging_cam: bool = false
var spawn_pos: Vector3 = Vector3(0.0, 2.0, 12.0)

func _ready() -> void:
	global_position = spawn_pos

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_RIGHT or event.button_index == MOUSE_BUTTON_LEFT:
			dragging_cam = event.pressed
	elif event is InputEventMouseMotion and dragging_cam:
		cam_pivot.rotate_y(-event.relative.x * mouse_sensitivity)
		var pitch_node := cam_pivot.get_node("SpringArm3D") as Node3D
		if pitch_node:
			pitch_node.rotation.x = clamp(pitch_node.rotation.x - event.relative.y * mouse_sensitivity, -1.15, -0.15)

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta

	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = jump_velocity

	if Input.is_action_just_pressed("dive") and dive_timer <= 0.0:
		dive_timer = 0.35
		var fwd := -visual.global_transform.basis.z
		velocity.x = fwd.x * dive_speed
		velocity.z = fwd.z * dive_speed
		if is_on_floor():
			velocity.y = 5.2

	if dive_timer > 0.0:
		dive_timer = max(0.0, dive_timer - delta)
		visual.rotation.x = lerp(visual.rotation.x, 0.85, delta * 14.0)
	else:
		visual.rotation.x = lerp(visual.rotation.x, 0.0, delta * 12.0)
		var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		var cam_basis := cam_pivot.global_transform.basis
		var dir := (cam_basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
		dir.y = 0.0
		if dir.length() > 0.05:
			velocity.x = lerp(velocity.x, dir.x * move_speed, delta * 10.0)
			velocity.z = lerp(velocity.z, dir.z * move_speed, delta * 10.0)
			var target_yaw := atan2(-dir.x, -dir.z)
			visual.rotation.y = lerp_angle(visual.rotation.y, target_yaw, delta * 12.0)
		else:
			velocity.x = lerp(velocity.x, 0.0, delta * 10.0)
			velocity.z = lerp(velocity.z, 0.0, delta * 10.0)

	move_and_slide()

	if global_position.y < -10.0:
		global_position = spawn_pos
		velocity = Vector3.ZERO

func apply_bounce(impulse: Vector3) -> void:
	velocity = impulse
