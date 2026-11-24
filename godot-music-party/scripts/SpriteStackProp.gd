extends Node2D

## Godot 4 Sprite-Stacking Renderer (based on sprite-stacking skill)
## Takes a horizontal slice strip texture (ground slice left, roof right)
## and renders crisp nearest-neighbour stacked layers that rotate 360 degrees.

@export var slice_strip: Texture2D
@export var slice_count: int = 36
@export var spacing: float = 1.0
@export var squash: float = 0.75
@export var turn_angle: float = 0.0
@export var pixel_scale: int = 4
@export var auto_spin: bool = true
@export var spin_speed: float = 1.2

var slices: Array[AtlasTexture] = []
var slice_w: int = 0
var slice_h: int = 0

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_rebuild_slices()

func _rebuild_slices() -> void:
	slices.clear()
	if slice_strip == null or slice_count <= 0:
		return
	var tex_w := slice_strip.get_width()
	var tex_h := slice_strip.get_height()
	assert(tex_w % slice_count == 0, "SpriteStackProp: strip width must be divisible by slice_count")
	slice_w = tex_w / slice_count
	slice_h = tex_h
	for z in range(slice_count):
		var atlas := AtlasTexture.new()
		atlas.atlas = slice_strip
		atlas.region = Rect2(z * slice_w, 0, slice_w, slice_h)
		slices.append(atlas)

func _process(delta: float) -> void:
	if auto_spin:
		turn_angle = wrapf(turn_angle + spin_speed * delta, 0.0, TAU)
		queue_redraw()

func _draw() -> void:
	if slices.is_empty():
		return
	var half_w := (slice_w - 1) * 0.5
	var half_h := (slice_h - 1) * 0.5
	for z in range(slices.size()):
		var lift := -roundf(float(z) * spacing * float(pixel_scale))
		draw_set_transform(Vector2(0.0, lift), 0.0, Vector2(float(pixel_scale), float(pixel_scale) * squash))
		draw_set_transform(Vector2(0.0, lift), turn_angle, Vector2(float(pixel_scale), float(pixel_scale) * squash))
		draw_texture(slices[z], Vector2(-half_w, -half_h))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
