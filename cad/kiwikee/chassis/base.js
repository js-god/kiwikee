const {circle, square} = require('@jscad/csg/api').primitives2d
const {cylinder, sphere, cube, torus} = require('@jscad/csg/api').primitives3d
const {color} = require('@jscad/csg/api').color
const {hull, chain_hull} = require('@jscad/csg/api').transformations
const {linear_extrude} = require('@jscad/csg/api').extrusions
const {rotate, translate, scale, mirror, contract, expand} = require('@jscad/csg/api').transformations
const {union, difference, intersection} = require('@jscad/csg/api').booleanOps

const {flatten} = require('../arrays')
const align = require('../utils/align')
const distribute = require('../utils/distribute')
const center = require('../utils/center')
const extractCenterPosition = require('../utils/extractCenterPosition')
// const {enlarge} = require('./lib/scaleAbs')
const roundedRectangle = require('../lib/roundedRect')
const {rectangle, ellipse} = require('../lib/V2mock/primitives2d')
const {linearExtrude} = require('../lib/V2mock/extrusions')

const myMirror = (vector, shape) => {
  let result = shape
  result = vector[0] !== 0 ? mirror([vector[0], 0, 0], result) : result
  result = vector[1] !== 0 ? mirror([0, vector[1], 0], result) : result
  result = vector[2] !== 0 ? mirror([0, 0, vector[2]], result) : result
  return result
}

const dimensions = require('../data').dimentions
const chassisData = dimensions.chassis

const chassis = (params) => {
  // console.log('params', params)

  const motorAxleClearance = 2
  const motorData = dimensions.motors[params.motorisation]
  const {size, axles, wallsThickness, pcbCut} = chassisData

  const innerBodySize = [
    ...size.slice(0, -1).map((x, idx) => x - wallsThickness[idx] * 2),
    size[2] - wallsThickness[2]
  ]

  // const motorSize = motorData.size
  const motorZOffset = motorData.size[2] / 2 + wallsThickness[2]
  const motorYPos = motorData.size[1] / 2 + innerBodySize[1] / 2 - motorData.size[1]
  const motorPlacements = [
    { position: [27, motorYPos, motorZOffset], orientation: undefined }, // [0, 0, 0] breaks mirror :()
    { position: [-27, motorYPos, motorZOffset], orientation: [1, 0, 0] }, // [0, 0, 0] breaks mirror :()
    { position: [27, -motorYPos, motorZOffset], orientation: [0, 1, 0] },
    { position: [-27, -motorYPos, motorZOffset], orientation: [1, 1, 0] }
  ]

  const availableMotorMounts = {
    miniGearMotor: require('../motorMounts/gearMotor')(motorData, axles, innerBodySize, wallsThickness),
    servo: () => {}
  }
  const motorMount = availableMotorMounts[params.motorisation]
  const motorMounts = motorPlacements.map(placement => {
    // console.log('placement', placement, motorMount)
    const additions = placement.orientation
      ? motorMount.additions.map(addition => translate(placement.position, myMirror(placement.orientation, addition)))
      : motorMount.additions.map(addition => translate(placement.position, addition))

    const removals = placement.orientation
    ? motorMount.removals.map(removal => translate(placement.position, myMirror(placement.orientation, removal)))
    : motorMount.removals.map(removal => translate(placement.position, removal))

    return {additions, removals}
  })

  const axleHoles = motorPlacements.map((placement, index) => {
    const axle = motorData.axle
    // from the borders !!
    return translate(placement.position,
      rotate([90, 0, 0], cylinder({d: axle.diameter + motorAxleClearance, center: [true, true, true], h: size[1] * 10, fn: 32}))
    )
  })

  const bodyOutline = hull(
    
    roundedRectangle({size, radius: 3})

    /*translate([50, 0, 0], roundedRectangle({size: [20, 70], radius: 2})),
    translate([40, 0, 0], roundedRectangle({size: [5, 70], radius: 2})),
    
    translate([40, 0, 0], roundedRectangle({size: [10, 58], radius: 3})),
    translate([-20, 0, 0], roundedRectangle({size: [10, 58], radius: 3})),

    translate([-20, 0, 0], roundedRectangle({size: [5, 90], radius: 2})),
    translate([-30, 0, 0], roundedRectangle({size: [20, 90], radius: 2})),*/
  )
  // return bodyOutline
  let body = difference(
    linear_extrude({height: size[2]}, bodyOutline),
    translate(
        [0, 0, wallsThickness[2]], // offset by size of bottom walls
        cube({size: innerBodySize, center: [true, true, false]})
      )
    ,
    ...axleHoles
  )

  // front
  // height of the bottom block before the connectors
  const connectorBottomOffset = 15
  const connectorInnerWidth = 42
  const connectorHeight = 10
  const connectorHeightExtra = 2

  const connectorCutHeight = connectorHeight + connectorHeightExtra

  const connectorAccessWidth = 46
  const connectorAccessHeight = size[2] - connectorCutHeight - connectorBottomOffset

  const frontBackCutoutOutline = union(
    translate([0, connectorCutHeight / 2], square({size: [connectorInnerWidth, connectorHeight + connectorHeightExtra], center: true})),
    translate([0, connectorCutHeight + connectorAccessHeight / 2],
      square({size: [connectorAccessWidth, connectorAccessHeight], center: true})
    )
  )
  const frontCutOffset = [innerBodySize[0] / 2, 0, connectorBottomOffset]
  let frontCut = translate(
    frontCutOffset,
    rotate(
      [90, 0, 90],
      linear_extrude({height: wallsThickness[1]}, frontBackCutoutOutline))
  )

  body = difference(
    body,
    color('black', frontCut)
  )
  // back
  let backCut = translate(
    [-innerBodySize[0] / 2 - wallsThickness[1], 0, connectorBottomOffset],
    rotate(
      [90, 0, 90],
      linear_extrude({height: wallsThickness[1]}, frontBackCutoutOutline))
  )

  body = difference(
    body,
    color('black', backCut)
  )
  // top pcb cut, from the original SMARS design
  /*
  const pcbCutOffset = [-innerBodySize[0] / 2, pcbCut.position[1], size[2] - pcbCut.position[2] - pcbCut.thickness + 0.5]
  const pcbCutOutline = union(
    square({
      size: [innerBodySize[1] + pcbCut.depth * 2, pcbCut.thickness],
      center: true
    }),
    square({
      size: [innerBodySize[1], 5],
      center: true
    })
  )

  body = difference(
    body,
    color('gray',
      translate(pcbCutOffset, rotate([90, 0, 90], linear_extrude({height: innerBodySize[0] + wallsThickness[0]}, pcbCutOutline)))
    )
  ) */
  // top side cuts 'v shapes'
  const sideCutBottomLength = 15
  const sideCutTopLength = 27
  const sideCutHeight = 10
  const sideCutsOutline = hull([
    translate([-sideCutBottomLength / 2, 0], circle()),
    translate([sideCutBottomLength / 2, 0], circle()),

    translate([-sideCutTopLength / 2, sideCutHeight], circle()),
    translate([sideCutTopLength / 2, sideCutHeight], circle())
  ])

  const sideCutsOffset = [0, size[1] / 2, size[2] - sideCutHeight]
  const sideCutShape = translate(sideCutsOffset,
    rotate([90, 0, 0],
      linear_extrude({height: wallsThickness[1]}, sideCutsOutline)
    )
  )

  body = difference(
    body,
    sideCutShape,
    mirror([0, 1, 0], sideCutShape)
  )

  // motor mount additions & subtractions
  body = union(body, ...motorMounts.map(x => x.additions))
  body = difference(body, ...motorMounts.map(x => x.removals))

  // battery holder system (cutouts & co)
  const batteryHolderHeight = 6.5
  const batterHolderRoundOffset = 0.5
  const batterySpacing = 15
  const batteriesCount = 2
  const batteryDia = 14
  const batteryDiaCleareance = 0.2
  const batteryConnectorDia = 8.5
  const batteryConnectorHolderThickness = 1
  const batteryConnectorCutoutThickness = 0.75 // how wide the cuts are where you insert the metal connectors
  const batteryMountWidthDiff = innerBodySize[1] + (batteryConnectorHolderThickness + batteryConnectorCutoutThickness) * 2
  const batterHolderWidth = batterySpacing * (batteriesCount - 1) + batteryDia
  const batteryConnectorCutoutOffset = ((batteriesCount - 1) * batterySpacing) / 2

  const batteryHolderCurvesLength = batteryMountWidthDiff - batteryConnectorHolderThickness
  // to ensore no connection between the two poles, we offset the bottom holder curves
  const batteryHolderCurvesOffset = batteryConnectorHolderThickness

  // main cutout
  const batteryCutoutZ = 2
  const batteryCutout = translate([0, 0, batteryCutoutZ], cube({size: [batterHolderWidth, batteryMountWidthDiff, 50], center: [true, true, false]}))
  body = difference(body, batteryCutout)

  const batterConnectorCutoutShape = hull(
    translate([0, batteryConnectorDia / 2 + batterHolderRoundOffset], circle({r: batteryConnectorDia / 2, center: true})),
    translate([0, batteryConnectorDia + batterHolderRoundOffset], square({size: [batteryConnectorDia, batteryConnectorDia], center: true}))
  )
  const batterConnectorHolderShape = translate([0, batteryHolderHeight / 2], square({size: [batterHolderWidth, batteryHolderHeight], center: true}))
  const allBatteryConnectorCutouts = union(
    Array(batteriesCount).fill(0).map((_, index) => translate([index * (batterySpacing) - batteryConnectorCutoutOffset, 0], batterConnectorCutoutShape))
  )
  const batterConnectorsHolderShape = difference(batterConnectorHolderShape, allBatteryConnectorCutouts)

  // console.log('innerBodySize', innerBodySize)
  const batterHolder = color('red', linear_extrude({height: batteryConnectorHolderThickness}, batterConnectorsHolderShape))
  body = union(body,
    translate([0, -innerBodySize[1] / 2, batteryCutoutZ], rotate([90, 0, 0], batterHolder)),
    translate([0, innerBodySize[1] / 2, batteryCutoutZ], mirror([0, 1, 0], rotate([90, 0, 0], batterHolder)))
  )

  const batteryCutoutDia = batteryDia + batteryDiaCleareance
  const batterCutoutShape = hull(
    translate([0, batteryCutoutDia / 2], circle({r: batteryCutoutDia / 2, center: true})),
    translate([0, batteryCutoutDia], square({size: [batteryCutoutDia, batteryCutoutDia], center: true}))
  )
  const allBatteryCutouts = union(
    Array(batteriesCount).fill(0).map((_, index) => translate([index * (batterySpacing) - batteryConnectorCutoutOffset, 0], batterCutoutShape))
  )
  const batteryHolderBottomCurvesShape = difference(
    translate([0, batteryConnectorDia / 2], square({size: [batterHolderWidth + 9, batteryConnectorDia], center: true})),
    allBatteryCutouts
  )
  // extra seperator between batteries
  const batterySecuritySeperator = translate([0, -innerBodySize[1] / 2, 0], cube({size: [1, 5, 15], center: [true, true, false]}))
  body = union(
    body,
    translate([0, batteryHolderCurvesLength / 2 - batteryHolderCurvesOffset, 0], rotate([90, 0, 0], linear_extrude({height: batteryHolderCurvesLength}, batteryHolderBottomCurvesShape))),
    batterySecuritySeperator
  )

  // nicer curves for cables
  const cablePassage = translate([0, 0, 10], rotate([0, 90, 0], cylinder({r: 3, h: innerBodySize[0], center: true})))
  body = difference(
    body,
    cablePassage
    // rotate([90, 0, 0], linear_extrude({height: batteryHolderCurvesLength}, allBatteryCutouts))
  )

  if (params.testPrintSlice) {
    /* body = intersection(
      body,
      cube({size: [70, 70, 16], center: [true, true, false]})
    ) */
    body = intersection(
      body,
      translate([30, 0, 0], cube({size: [25, 70, 16], center: [true, true, false]}))
    )
  }

  const motorBlockColor = params.chSeeThrough ? [0.5, 0.5, 0.5, 0.5] : [0.5, 0.5, 0.5]

  let results = []
  if (params.chShowMotorBlock) {
    results = results.concat(color(motorBlockColor, body))
  }
  if (params.chShowCoverBlock) {
    results = results.concat(require('./cover')(size, body, params))
  }

  if (params.chShowBatteries) {
    const batteryShape = require('../battery')
    const batteries = [
      translate([8, -25.5, 10],
        rotate([0, 90, 90], batteryShape())
      ),
      translate([-8, -25.5, 10],
        rotate([0, 90, 90], batteryShape())
      )
    ]
    results = results.concat([...batteries])
  }

  if (params.chShowMotors) {
    const motor = require('../motors/gearMotor')()
    const motors = motorPlacements.map(placement => {
      return placement.orientation
        ? translate(placement.position, myMirror(placement.orientation, motor))
        : translate(placement.position, motor)
    })
    results = results.concat(motors)
  }

  if (params.chShowConnectorFront) {
    results = results.concat(
      translate([-37, 0, connectorBottomOffset], require('../smars-connectors/holder')(params.chConnectorsFrontCount))
    )
  }

  console.log('chShowElectronicsHolder', params, params.chShowElectronicsHolder)

  if (params.chShowElectronicsHolder) {
    const electronics = translate([0, 0, connectorBottomOffset + connectorHeight],
    cube({size: [70, 40, 1.6], center: [true, true, false]})
  )
    const sideCutsOffsetX = 27
    const sideCutsOffsetY = 25
    const outerClearance = 0.1
    const electronicsClearance = 0.6

    const electronicsHolderShape = difference(
    // body inner
    rectangle({size: [70, innerBodySize[1] - outerClearance, 2], center: true}),
    // center cut out
    rectangle({size: [15, 40, 1.6], center: true}),
    // front & back cut outs
    translate([30, 0], rectangle({size: [15, 40, 1.6], center: true})),
    translate([-30, 0], rectangle({size: [15, 40, 1.6], center: true})),
    // side cut outs
    translate([0, sideCutsOffsetY], roundedRectangle({size: [26, 5, 1.6], center: true, radius: 1})),
    translate([0, -sideCutsOffsetY], roundedRectangle({size: [26, 5, 1.6], center: true, radius: 1})),

    translate([sideCutsOffsetX, sideCutsOffsetY], roundedRectangle({size: [8, 5, 1.6], center: true, radius: 1})),
    translate([sideCutsOffsetX, -sideCutsOffsetY], roundedRectangle({size: [8, 5, 1.6], center: true, radius: 1})),

    translate([-sideCutsOffsetX, sideCutsOffsetY], roundedRectangle({size: [8, 5, 1.6], center: true, radius: 1})),
    translate([-sideCutsOffsetX, -sideCutsOffsetY], roundedRectangle({size: [8, 5, 1.6], center: true, radius: 1}))
  )
    const electronicsHolderThickness = 5
    const electronicsHolder = difference(
    translate([0, 0, connectorBottomOffset + connectorHeight], linearExtrude({height: electronicsHolderThickness}, electronicsHolderShape)),
    // frontCut,
    // backCut
    // electronics
    translate([0, 0, connectorBottomOffset + connectorHeight + 1.6], cube({size: [70, 40 + electronicsClearance, electronicsHolderThickness], center: [true, true, false]})),
    body
  )
    results = results.concat(
      // electronics,
      electronicsHolder
    )
  }

  return results
}

module.exports = chassis
