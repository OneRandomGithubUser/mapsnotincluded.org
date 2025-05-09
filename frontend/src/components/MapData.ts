export enum RenderLayer {
    ELEMENT_BACKGROUND,
    ELEMENT_OVERLAY,
    TEMPERATURE_OVERLAY,
    MASS_OVERLAY
}
export enum DataImageType {
    ELEMENT_IDX,
    TEMPERATURE,
    MASS
}

const connectedLayers: [RenderLayer, DataImageType][] = [
    [RenderLayer.ELEMENT_BACKGROUND, DataImageType.ELEMENT_IDX],
    [RenderLayer.ELEMENT_OVERLAY, DataImageType.ELEMENT_IDX],
    [RenderLayer.TEMPERATURE_OVERLAY, DataImageType.TEMPERATURE],
    [RenderLayer.MASS_OVERLAY, DataImageType.MASS]
];

const layerToDataImageType = new Map<RenderLayer, DataImageType[]>();
for (const [layer, dataImageType] of connectedLayers) {
    if (!layerToDataImageType.has(layer)) {
        layerToDataImageType.set(layer, []);
    }
    layerToDataImageType.get(layer)!.push(dataImageType);
}
const dataImageTypeToLayer = new Map<DataImageType, RenderLayer[]>();
for (const [layer, dataImageType] of connectedLayers) {
    if (!dataImageTypeToLayer.has(dataImageType)) {
        dataImageTypeToLayer.set(dataImageType, []);
    }
    dataImageTypeToLayer.get(dataImageType)!.push(layer);
}

export function getDataImageType(layer: RenderLayer): DataImageType[] {
    const dataImageTypes = layerToDataImageType.get(layer);
    if (!dataImageTypes) {
        throw new Error(`No data image type found for layer ${RenderLayer[layer]}`);
    }
    return dataImageTypes;
}
export function getRenderLayer(dataImageType: DataImageType): RenderLayer[] {
    const layers = dataImageTypeToLayer.get(dataImageType);
    if (!layers) {
        throw new Error(`No render layer found for data image type ${DataImageType[dataImageType]}`);
    }
    return layers;
}