## The structural weakness that stopped printing is fixed

The J2 and J3 output flanges were **1 mm thick** and carried the whole arm
through six M5 screws each. At J2 that was 63 N a bolt bearing on one
millimetre of printed plastic, 12 MPa against about 5 that the material will
take. Both are rebuilt: J2 is now 6 mm and seats in a Ø96 register in the arm
cheeks, so the torque goes through a cylindrical face instead of the screws,
and J3 is 8 mm. Nothing outside the arm changed size.

Four other things were found and fixed at the same time. The screws holding
that flange passed through a 5.4 mm hole — clearance for M5, not a thread — so
they gripped nothing at all; the cheeks now take heat-set inserts. The metal hub
on the J2 output sat in a cavity closed at both ends and could not physically be
fitted. The arm cheeks were trapped in a slot with a wall on both sides, so the
build order changed to finish the rotating group before the turret closes around
it. And all 121 printed parts were checked against each other for shared
material: 34 pairs overlapped, now none except a gear pair drawn at its exact
pitch circle.

**Still true: nobody has built this arm.** It is checked in CAD, not in metal
and plastic. Print it if you want to help find what CAD cannot see.

# A robot arm you can print

![The arm](docs/img/arm-iso.png)

I am building a six-axis robot arm that you can make at home. Almost every part
of it comes off a 3D printer. What is left over is bearings, stepper
motors and screws, all of it for less then 400$. Alongside the arm I am also
building a AI model for object detection which will run on a Rockchip RK3588.
Camera mount was already added to the model and asembly guides.

## Where this is right now

Work in progress. What sits in this repository today is the printable parts and
nothing else.

The arm is fully designed, and I have checked the motion and the fits in CAD.
But I have not built it, and neither has anyone else. So treat these files as
something to print and look at, not as a finished kit that is known to work.

## The assembly guide

The assembly guide has been finally published, both czech and english versions.
The manuals were created not only show how to put the prined pieces together,
but also to act as a shopping list for all the necessary parts. Soon I am planning 
on publishing links for the items needed (as soon as I finish the build and asure good
quality of the parts)

## What is in here

Everything printable, in `print_parts`, split into seven folders that follow the
order you need them:

- base and J1 turret
- J2 shoulder
- J3 elbow and upper arm
- J4 forearm roll
- J5 and J6 differential wrist
- gripper
- forearm lids

Both manuals are in `docs` folder

Every part has an STL to print and a STEP next to it if you would rather remesh
it or change something. Each folder has a short readme with the material, layer
height, perimeters, infill, supports and print orientation for each part.

## How the arm works

Six axes, plus a two-finger gripper on the end.

The wrist is the part I am most pleased with. Both wrist motors sit back on the
forearm and never turn with the joint. Two belts drive two input spools, and the
wrist reads the sum of them as pitch and the difference as roll. That means the
tool can spin without ever stopping, because nothing winds up, and it keeps the
weight of two motors off the far end of the arm where you feel it most.

Homing runs on a single pair of wires. The switches are wired in series, so one
break tells the controller a flag arrived, and the axis you were moving tells it
which. The wrist pitch has no switch at all. It finds home by driving gently into
a printed stop.

![The arm from behind](docs/img/arm-rear-quarter.png)

## A word about material

The readmes name a material for every part and it is worth following. Parts in
the load path or next to a motor are ASA, because stepper bodies get hot enough
that PLA slowly gives way under the permanent squeeze that every bolted joint
lives under.

Covers, gears, pulleys and brackets are PETG and much less fussy.

