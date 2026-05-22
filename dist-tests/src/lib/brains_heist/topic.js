const clampRatio = (value) => {
    if (Number.isNaN(value) || !Number.isFinite(value))
        return 0;
    if (value < 0)
        return 0;
    return value;
};
export const classifyTopicStatus = ({ accuracy, avgTimeRatio, retryCount, }) => {
    const normalizedAccuracy = clampRatio(accuracy);
    const normalizedTime = clampRatio(avgTimeRatio);
    const normalizedRetries = clampRatio(retryCount);
    const qualifiesStruggled = normalizedAccuracy < 0.7 || normalizedTime > 1 || normalizedRetries >= 3;
    if (qualifiesStruggled) {
        return 'STRUGGLED';
    }
    const qualifiesAverage = normalizedAccuracy >= 0.7 &&
        normalizedAccuracy < 0.9 &&
        normalizedTime >= 0.71 &&
        normalizedTime <= 1 &&
        normalizedRetries <= 2;
    if (qualifiesAverage) {
        return 'AVERAGE';
    }
    const qualifiesCrushed = normalizedAccuracy >= 0.9 &&
        normalizedTime <= 0.7 &&
        normalizedRetries <= 1;
    if (qualifiesCrushed) {
        return 'CRUSHED';
    }
    return 'AVERAGE';
};
