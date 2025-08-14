function normalPDF(x, mean = 0, sd = 1) {
  const coeff = 1 / (sd * Math.sqrt(2 * Math.PI));
  const exponent = -((x - mean) ** 2) / (2 * sd ** 2);
  return coeff * Math.exp(exponent);
}


function weightedSampleWithoutReplacement(items, weights, n) {
  const result = [];
  const itemsCopy = [...items];
  const weightsCopy = [...weights];

  for (let i = 0; i < n && itemsCopy.length > 0; i++) {
    const total = weightsCopy.reduce((a, b) => a + b, 0);
    const rnd = Math.random() * total;
    let acc = 0;
    let index = -1;

    for (let j = 0; j < weightsCopy.length; j++) {
      acc += weightsCopy[j];
      if (rnd <= acc) {
        index = j;
        break;
      }
    }

    result.push(itemsCopy[index]);
    itemsCopy.splice(index, 1);
    weightsCopy.splice(index, 1);
  }

  return result;
}