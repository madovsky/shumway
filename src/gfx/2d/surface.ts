module Shumway.GFX.Canvas2D {
  import Rectangle = Shumway.GFX.Geometry.Rectangle;

  import assert = Shumway.Debug.assert;

  declare var registerScratchCanvas;

  var isFirefox = navigator.userAgent.indexOf('Firefox') != -1;

  export class Filters {
    /**
     * Reusable blur filter SVG element.
     */
    static _svgBlurFilter: Element;

    /**
     * Reusable dropshadow filter SVG element.
     */
    static _svgDropshadowFilterBlur: Element;
    static _svgDropshadowFilterFlood: Element;
    static _svgDropshadowFilterOffset: Element;

    /**
     * Reusable colormatrix filter SVG element.
     */
    static _svgColorMatrixFilter: Element;

    static _svgFiltersAreSupported = !!Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "filter");

    /**
     * Creates an SVG element and defines filters that are referenced in |canvas.filter| properties. We cannot
     * inline CSS filters because they don't expose independent blurX and blurY properties.
     * This only works in Firefox, and you have to set the 'canvas.filters.enabled' equal to |true|.
     */
    private static _prepareSVGFilters() {
      if (Filters._svgBlurFilter) {
        return;
      }
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

      // Blur Filter
      var blurFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      blurFilter.setAttribute("id", "svgBlurFilter");
      var feGaussianFilter = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
      feGaussianFilter.setAttribute("stdDeviation", "0 0");
      blurFilter.appendChild(feGaussianFilter);
      defs.appendChild(blurFilter);
      Filters._svgBlurFilter = feGaussianFilter;

      // Drop Shadow Filter
      var dropShadowFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      dropShadowFilter.setAttribute("id", "svgDropShadowFilter");
      var feGaussianFilter = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
      feGaussianFilter.setAttribute("in", "SourceAlpha");
      feGaussianFilter.setAttribute("stdDeviation", "3");
      dropShadowFilter.appendChild(feGaussianFilter);
      Filters._svgDropshadowFilterBlur = feGaussianFilter;

      var feOffset = document.createElementNS("http://www.w3.org/2000/svg", "feOffset");
      feOffset.setAttribute("dx", "0");
      feOffset.setAttribute("dy", "0");
      feOffset.setAttribute("result", "offsetblur");
      dropShadowFilter.appendChild(feOffset);
      Filters._svgDropshadowFilterOffset = feOffset;

      var feFlood = document.createElementNS("http://www.w3.org/2000/svg", "feFlood");
      feFlood.setAttribute("flood-color", "rgba(0,0,0,1)");
      dropShadowFilter.appendChild(feFlood);
      Filters._svgDropshadowFilterFlood = feFlood;

      var feComposite = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
      feComposite.setAttribute("in2", "offsetblur");
      feComposite.setAttribute("operator", "in");
      dropShadowFilter.appendChild(feComposite);

      var feMerge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
      var feMergeNode = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
      feMerge.appendChild(feMergeNode);

      var feMergeNode = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
      feMergeNode.setAttribute("in", "SourceGraphic");
      feMerge.appendChild(feMergeNode);
      dropShadowFilter.appendChild(feMerge);
      defs.appendChild(dropShadowFilter);

      var colorMatrixFilter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      colorMatrixFilter.setAttribute("id", "svgColorMatrixFilter");
      var feColorMatrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
      // Color interpolation in linear RGB doesn't seem to match Flash's results.
      feColorMatrix.setAttribute("color-interpolation-filters", "sRGB");
      feColorMatrix.setAttribute("in", "SourceGraphic");
      feColorMatrix.setAttribute("type", "matrix");
      colorMatrixFilter.appendChild(feColorMatrix);
      defs.appendChild(colorMatrixFilter);
      Filters._svgColorMatrixFilter = feColorMatrix;
      svg.appendChild(defs);
      document.documentElement.appendChild(svg);
    }

    static _applyColorMatrixFilter(context: CanvasRenderingContext2D, colorMatrix: ColorMatrix) {
      Filters._prepareSVGFilters();
      Filters._svgColorMatrixFilter.setAttribute("values", colorMatrix.toSVGFilterMatrix());
      context.filter = "url(#svgColorMatrixFilter)";
    }

    /**
     * This doesn't currently allow you to specify multiple filters. Only the last one is used.
     * To support multiple filters, we need to group them in SVG nodes.
     */
    static _applyFilters(ratio: number, context: CanvasRenderingContext2D, filters: Filter []) {
      Filters._prepareSVGFilters();
      Filters._removeFilters(context);
      var scale = ratio;
      /**
       * Scale blur radius for each quality level. The scale constants were gathered
       * experimentally.
       */
      function getBlurScale(quality: number) {
        var blurScale = ratio / 2; // For some reason we always have to scale by 1/2 first.
        switch (quality) {
          case 0:
            return 0;
          case 1:
            return blurScale / 2.7;
          case 2:
            return blurScale / 1.28;
          case 3:
          default:
            return blurScale;
        }
      }
      for (var i = 0; i < filters.length; i++) {
        var filter = filters[i];
        if (filter instanceof BlurFilter) {
          var blurFilter = <BlurFilter>filter;
          var blurScale = getBlurScale(blurFilter.quality);
          Filters._svgBlurFilter.setAttribute("stdDeviation",
            blurFilter.blurX * blurScale + " " +
              blurFilter.blurY * blurScale);
          context.filter = "url(#svgBlurFilter)";
        } else if (filter instanceof DropshadowFilter) {
          var dropshadowFilter = <DropshadowFilter>filter;
          var blurScale = getBlurScale(dropshadowFilter.quality);
          Filters._svgDropshadowFilterBlur.setAttribute("stdDeviation",
            dropshadowFilter.blurX * blurScale + " " +
              dropshadowFilter.blurY * blurScale
          );
          Filters._svgDropshadowFilterOffset.setAttribute("dx",
            String(Math.cos(dropshadowFilter.angle * Math.PI / 180) * dropshadowFilter.distance * scale));
          Filters._svgDropshadowFilterOffset.setAttribute("dy",
            String(Math.sin(dropshadowFilter.angle * Math.PI / 180) * dropshadowFilter.distance * scale));
          Filters._svgDropshadowFilterFlood.setAttribute("flood-color",
            ColorUtilities.rgbaToCSSStyle(((dropshadowFilter.color << 8) | Math.round(255 * dropshadowFilter.alpha))));
          context.filter = "url(#svgDropShadowFilter)";
        }
      }
    }

    static _removeFilters(context: CanvasRenderingContext2D) {
      // For some reason, setting this to the default empty string "" does
      // not work, it expects "none".
      context.filter = "none";
    }

    static _applyColorMatrix(context: CanvasRenderingContext2D, colorMatrix: ColorMatrix) {
      Filters._removeFilters(context);
      if (colorMatrix.isIdentity()) {
        context.globalAlpha = 1;
        context.globalColorMatrix = null;
      } else if (colorMatrix.hasOnlyAlphaMultiplier()) {
        context.globalAlpha = colorMatrix.alphaMultiplier;
        context.globalColorMatrix = null;
      } else {
        context.globalAlpha = 1;
        if (Filters._svgFiltersAreSupported && true) {
          Filters._applyColorMatrixFilter(context, colorMatrix);
          context.globalColorMatrix = null;
        } else {
          context.globalColorMatrix = colorMatrix;
        }
      }
    }
  }

  /**
   * Match up FLash blend modes with Canvas blend operations:
   *
   * See: http://kaourantin.net/2005/09/some-word-on-blend-modes-in-flash.html
   */
  function getCompositeOperation(blendMode: BlendMode): string {
    // TODO:

    // These Flash blend modes have no canvas equivalent:
    // - BlendMode.Subtract
    // - BlendMode.Invert
    // - BlendMode.Shader
    // - BlendMode.Add is similar to BlendMode.Screen

    // These blend modes are actually Porter-Duff compositing operators.
    // The backdrop is the nearest parent with blendMode set to layer.
    // When there is no LAYER parent, they are ignored (treated as NORMAL).
    // - BlendMode.Alpha (destination-in)
    // - BlendMode.Erase (destination-out)
    // - BlendMode.Layer [defines backdrop]

    var compositeOp: string = "source-over";
    switch (blendMode) {
      case BlendMode.Normal:
      case BlendMode.Layer:
        return compositeOp;
      case BlendMode.Multiply:   compositeOp = "multiply";        break;
      case BlendMode.Add:
      case BlendMode.Screen:     compositeOp = "screen";          break;
      case BlendMode.Lighten:    compositeOp = "lighten";         break;
      case BlendMode.Darken:     compositeOp = "darken";          break;
      case BlendMode.Difference: compositeOp = "difference";      break;
      case BlendMode.Overlay:    compositeOp = "overlay";         break;
      case BlendMode.HardLight:  compositeOp = "hard-light";      break;
      case BlendMode.Alpha:      compositeOp = "destination-in";  break;
      case BlendMode.Erase:      compositeOp = "destination-out"; break;
      default:
        Shumway.Debug.somewhatImplemented("Blend Mode: " + BlendMode[blendMode]);
    }
    return compositeOp;
  }

  /**
   * Some blend modes are super slow in FF and depend on the size of the
   * target canvas, 512px appears to be the largest canvas size that is
   * not very slow.
   */
  function isBlendModeSlow(blendMode: BlendMode) {
    if (!isFirefox) {
      return false;
    }
    switch (blendMode) {
      case BlendMode.Alpha:
        return true;
      default:
        return false;
    }
  }

  export class Canvas2DSurfaceRegion implements ISurfaceRegion {

    /**
     * Draw image is really slow if the soruce and destination are the same. We use
     * a temporary canvas for all such copy operations.
     */
    private static _copyCanvasContext: CanvasRenderingContext2D;
    private static _blendCanvasContext: CanvasRenderingContext2D;

    private _blendMode: BlendMode = BlendMode.Normal;

    constructor (
      public surface: Canvas2DSurface,
      public region: RegionAllocator.Region,
      public w: number,
      public h: number
    ) {
      // ...
    }

    public free() {
      this.surface.free(this)
    }

    public set blendMode(value: BlendMode) {
      if (this._blendMode !== value) {
        this._blendMode = value;
        this.context.globalCompositeOperation = getCompositeOperation(value);
      }
    }

    private static _ensureCopyCanvasSize(w: number, h: number) {
      var canvas;
      if (!Canvas2DSurfaceRegion._copyCanvasContext) {
        canvas = document.createElement("canvas");
        registerScratchCanvas(canvas);
        canvas.width = 512;
        canvas.height = 512;
        Canvas2DSurfaceRegion._copyCanvasContext = canvas.getContext("2d");
      } else {
        canvas = Canvas2DSurfaceRegion._copyCanvasContext.canvas;
        if (canvas.width < w || canvas.height < h) {
          canvas.width = IntegerUtilities.nearestPowerOfTwo(w);
          canvas.height = IntegerUtilities.nearestPowerOfTwo(h);
        }
      }
    }

    private static _ensureBlendCanvasSize(w: number, h: number) {
      var canvas;
      if (!Canvas2DSurfaceRegion._blendCanvasContext) {
        canvas = document.createElement("canvas");
        registerScratchCanvas(canvas);
        canvas.width = 256;
        canvas.height = 256;
        Canvas2DSurfaceRegion._blendCanvasContext = canvas.getContext("2d");
      } else {
        canvas = Canvas2DSurfaceRegion._blendCanvasContext.canvas;
        if (canvas.width < w || canvas.height < h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    }
    
    public draw(source: Canvas2DSurfaceRegion, x: number, y: number, w: number, h: number) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      var sourceCanvas, sx = 0, sy = 0;
      // Handle copying from and to the same canvas.
      if (source.context.canvas === this.context.canvas) {
        Canvas2DSurfaceRegion._ensureCopyCanvasSize(w, h);
        var copyContext = Canvas2DSurfaceRegion._copyCanvasContext;
        copyContext.clearRect(0, 0, w, h);
        copyContext.drawImage(
          source.surface.canvas,
          source.region.x, source.region.y, w, h,
          0, 0, w, h
        );
        sourceCanvas = copyContext.canvas;
        sx = 0;
        sy = 0;
      } else {
        sourceCanvas = source.surface.canvas;
        sx = source.region.x;
        sy = source.region.y;
      }
      var canvas = this.context.canvas;
      if (!isBlendModeSlow(this._blendMode) || Math.max(canvas.width, canvas.height) < 512) {
        this.context.drawImage(sourceCanvas, sx, sy, w, h, x, y, w, h);
      } else {
        // Bend time and space just so we can blend faster. Copy the destination
        // to a temporary canvas, blend into it, and then copy it back to the original
        // position.
        Canvas2DSurfaceRegion._ensureBlendCanvasSize(w, h);
        var blendContext = Canvas2DSurfaceRegion._blendCanvasContext;
        blendContext.clearRect(0, 0, w, h);
        blendContext.globalCompositeOperation = getCompositeOperation(BlendMode.Normal);
        blendContext.drawImage(this.context.canvas, x, y, w, h, 0, 0, w, h);
        blendContext.globalCompositeOperation = getCompositeOperation(this._blendMode);
        blendContext.drawImage(sourceCanvas, sx, sy, w, h, 0, 0, w, h);
        var lastBlendMode = this._blendMode;
        this.blendMode = BlendMode.Normal;
        this.context.clearRect(x, y, w, h);
        this.context.drawImage(blendContext.canvas, 0, 0, w, h, x, y, w, h);
        this.blendMode = lastBlendMode;
      }
    }

    get context(): CanvasRenderingContext2D {
      return this.surface.context;
    }

    public resetTransform() {
      this.surface.context.setTransform(1, 0, 0, 1, 0, 0);
    }

    public fill(fillStyle: any) {
      var context = this.surface.context, region = this.region;
      context.fillStyle = fillStyle;
      context.fillRect(region.x, region.y, region.w, region.h);
    }

    public clear(rectangle?: Rectangle) {
      var context = this.surface.context, region = this.region;
      if (!rectangle) {
        rectangle = region;
      }
      context.clearRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
    }
  }

  export class Canvas2DSurface implements ISurface {
    w: number;
    h: number;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    private _regionAllocator: RegionAllocator.IRegionAllocator;
    constructor(canvas: HTMLCanvasElement, regionAllocator?: RegionAllocator.IRegionAllocator) {
      this.canvas = canvas;
      this.context = canvas.getContext("2d");
      this.w = canvas.width;
      this.h = canvas.height;
      this._regionAllocator = regionAllocator;
    }
    allocate(w: number, h: number): Canvas2DSurfaceRegion {
      var region = this._regionAllocator.allocate(w, h);
      if (region) {
        return new Canvas2DSurfaceRegion(this, region, w, h);
      }
      return null;
    }
    free(surfaceRegion: Canvas2DSurfaceRegion) {
      this._regionAllocator.free(surfaceRegion.region);
    }
  }
}
