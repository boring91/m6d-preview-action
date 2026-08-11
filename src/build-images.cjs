const assert = require('node:assert/strict');

function buildPlan(imagesJson, tag) {
  let images;

  try {
    images = JSON.parse(imagesJson);
  } catch {
    throw new Error('images must be valid JSON');
  }

  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('images must be a non-empty JSON array');
  }
  if (!/^pr-[1-9][0-9]*-[0-9a-f]{40,64}$/.test(tag)) {
    throw new Error('image tag must contain a pull-request number and commit SHA');
  }

  return images.map((image, index) => {
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      throw new Error(`images[${index}] must be an object`);
    }

    for (const field of ['name', 'image', 'context', 'dockerfile']) {
      if (typeof image[field] !== 'string' || image[field].trim() === '') {
        throw new Error(`images[${index}].${field} must be a non-empty string`);
      }
    }
    if (image.build_args != null && typeof image.build_args !== 'string') {
      throw new Error(`images[${index}].build_args must be a string`);
    }

    const args = [
      'buildx',
      'build',
      '--file',
      image.dockerfile,
      '--tag',
      `${image.image}:${tag}`,
      '--push'
    ];

    for (const buildArg of (image.build_args || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      args.push('--build-arg', buildArg);
    }

    args.push(image.context);
    return { name: image.name, args };
  });
}

async function buildImages({ core, exec, imagesJson, tag }) {
  for (const image of buildPlan(imagesJson, tag)) {
    core.startGroup(`Build ${image.name}`);
    try {
      await exec.exec('docker', image.args);
    } finally {
      core.endGroup();
    }
  }
}

module.exports = buildImages;
module.exports.buildPlan = buildPlan;

if (require.main === module) {
  const tag = `pr-42-${'a'.repeat(40)}`;
  assert.deepEqual(
    buildPlan(
      JSON.stringify([
        {
          name: 'web',
          image: 'acme/web',
          context: './web',
          dockerfile: './web/Dockerfile',
          build_args: 'APP_ENV=preview\nEMPTY='
        }
      ]),
      tag
    ),
    [
      {
        name: 'web',
        args: [
          'buildx',
          'build',
          '--file',
          './web/Dockerfile',
          '--tag',
          `acme/web:${tag}`,
          '--push',
          '--build-arg',
          'APP_ENV=preview',
          '--build-arg',
          'EMPTY=',
          './web'
        ]
      }
    ]
  );
}
