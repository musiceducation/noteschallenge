extends AnimatableBody3D

@export var spin_speed: float = 1.65

func _physics_process(delta: float) -> void:
	rotate_y(spin_speed * delta)
