/* By Morgan McGuire @CasualEffects https://casual-effects.com LGPL 3.0 License */

'use strict';

function _show() {

    // Check whether this frame will be shown or not, if running below
    // frame rate and pruning graphics.  Use mode_frames instead of
    // game_frames to ensure that frame 0 is always rendered for a mode.
    if (mode_frames % _graphicsPeriod === 0) {
        const startTime = performance.now();
        
        // clear the screen
        if (_background.spritesheet) {
            // Image background
            _screen.set(_background.spritesheet._uint32Data);
        } else {
            // Color background (force alpha = 1)
            let c = (_colorToUint32(_background) >>> 0) | 0xff000000;
            _screen.fill(c, 0, _screen.length);
        }
        
        // Sort
        _graphicsCommandList.sort(_zSort);
        
        // Eval draw list
        for (let i = 0; i < _graphicsCommandList.length; ++i) {
            const cmd = _graphicsCommandList[i];
            _executeTable[cmd.opcode](cmd);
        }
    
        _submitFrame();
        _graphicsTime = performance.now() - startTime;
    }
    
    _requestInput();
    
    // Save for replays
    _previousGraphicsCommandList = _graphicsCommandList;
    
    // Clear draw list (regardless of whether it is actually drawn)
    _graphicsCommandList = [];

    ++game_frames;
    ++mode_frames;
}


/** Updates the z value with an epsilon and stores the current set_clipping region */
function _addGraphicsCommand(cmd) {
    cmd.clipX1 = _clipX1;
    cmd.clipY1 = _clipY1;
    cmd.clipX2 = _clipX2;
    cmd.clipY2 = _clipY2;

    // Offset subsequent commands to get a unique z value for each,
    // and stable sort ordering. The offset value must be orders of
    // magnitude less than the quadplay epsilon value to avoid
    // confusion for programmers with z ordering.
    cmd.z     += _graphicsCommandList.length * Math.sign(_scaleZ) * 1e-10;
    
    _graphicsCommandList.push(cmd);
}



/** Color is 32-bit RGBA. This implementation assumes a little-endian
    processor (which includes all current Intel, AMD, ARM, Raspberry
    Pi processors by default). DataView can be used to make an
    endian-independent version if required. */
function _pset(x, y, color, clipX1, clipY1, clipX2, clipY2) {
    // nano pixels have integer centers, so we must round instead of just truncating.
    // Otherwise -0.7, which is offscreen, would become 0 and be visible.
    //
    // "i >>> 0" converts from signed to unsigned int, which forces negative values to be large
    // and lets us early-out sooner in the tests.
    const i = Math.round(x) >>> 0;
    const j = Math.round(y) >>> 0;

    if ((i <= clipX2) && (j <= clipY2) && (i >= clipX1) && (y >= clipY1)) {
        const offset = i + j * _SCREEN_WIDTH;

        // Must be unsigned shift to avoid sign extension
        const a255 = color >>> 24;

        if (a255 === 0xff) {
            // No blending
            _screen[offset] = color;
        } else if (a255 > 0) {
            // Blend

            // No need to force to unsigned int because the alpha channel of the output is always 0xff
            
            const a = a255 * (1 / 255);
            let back = _screen[offset];
            let result = 0xFF000000;
            result |= ((back & 0x00FF0000) * (1 - a) + (color & 0x00FF0000) * a + 0.5) & 0x00FF0000;
            result |= ((back & 0x0000FF00) * (1 - a) + (color & 0x0000FF00) * a + 0.5) & 0x0000FF00;
            result |= ((back & 0x000000FF) * (1 - a) + (color & 0x000000FF) * a + 0.5) & 0x000000FF;
            _screen[offset] = result;
        }
    }
}

/** Assumes x2 >= x1 and that color is RGBA. Does not assume that x1 and x2 or y are
    on screen. */
function _hline(x1, y, x2, color, clipX1, clipY1, clipX2, clipY2) {
    x1 = Math.round(x1) | 0;
    x2 = Math.round(x2) | 0;
    y  = Math.round(y) | 0;

    if ((x2 >= clipX1) && (x1 <= clipX2) && (y >= clipY1) && (y <= clipY2)) {
        // Some part is on screen

        // Don't draw past the edge of the screen
        x1 = Math.max(x1, clipX1);
        x2 = Math.min(x2, clipX2);
        
        let a255 = color >>> 24;
        if (a255 === 0xff) {
            // Overwrite
            _screen.fill(color, x1 + (y * _SCREEN_WIDTH), x2 + (y * _SCREEN_WIDTH) + 1);
        } else if (a255 > 0) {
            // Blend (see comments in _pset)
            const a = a255 * (1 / 255);
            const r = (color & 0x00FF0000) * a + 0.5;
            const g = (color & 0x0000FF00) * a + 0.5;
            const b = (color & 0x000000FF) * a + 0.5;

            for (let x = x1, offset = x1 + y * _SCREEN_WIDTH; x <= x2; ++x, ++offset) {
                let back = _screen[offset];
                let result = 0xFF000000;
                result |= ((back & 0x00FF0000) * (1 - a) + r) & 0x00FF0000;
                result |= ((back & 0x0000FF00) * (1 - a) + g) & 0x0000FF00;
                result |= ((back & 0x000000FF) * (1 - a) + b) & 0x000000FF;
                _screen[offset] = result;
            }
        }
    }
}

/** Assumes y2 >= y1 and that color is RGBA. Does not assume that y1 and y2 or x are
    on screen */
function _vline(x, y1, y2, color, clipX1, clipY1, clipX2, clipY2) {
    x  = Math.round(x) | 0;
    y1 = Math.round(y1) | 0;
    y2 = Math.round(y2) | 0;
    
    if ((y2 >= clipY1) && (y1 <= clipY2) && (x >= clipX1) && (x <= clipX2)) {
        y1 = Math.max(clipY1, y1);
        y2 = Math.min(clipY2, y2);

        let a255 = color >>> 24;
        if (a255 === 0xff) {
            for (let y = y1, offset = y1 * _SCREEN_WIDTH + x; y <= y2; ++y, offset += _SCREEN_WIDTH) {
                _screen[offset] = color;
            }
        } else if (a255 > 0) {
            // Blend (see comments in _pset)
            const a = a255 * (1 / 255);
            const r = (color & 0x00FF0000) * a + 0.5;
            const g = (color & 0x0000FF00) * a + 0.5;
            const b = (color & 0x000000FF) * a + 0.5;
            for (let y = y1, offset = y1 * _SCREEN_WIDTH + x; y <= y2; ++y, offset += _SCREEN_WIDTH) {
                let back = _screen[offset];
                let result = 0xFF000000;
                result |= ((back & 0x00FF0000) * (1 - a) + r) & 0x00FF0000;
                result |= ((back & 0x0000FF00) * (1 - a) + g) & 0x0000FF00;
                result |= ((back & 0x000000FF) * (1 - a) + b) & 0x000000FF;
                _screen[offset] = result;
            }
        }
    }
}


function _executeCIR(cmd) {
    const outline = cmd.outline, color = cmd.color,
          x = cmd.x, y = cmd.y, radius = cmd.radius;
    
    const clipX1 = cmd.clipX1, clipY1 = cmd.clipY1,
          clipX2 = cmd.clipX2, clipY2 = cmd.clipY2;
    
    if (color & 0xff000000) {
        // offset
        let ox = radius - 1, oy = 0;
        
        // step
        let dx = 1, dy = 1;
        let err = dx - radius * 2;

        // Midpoint circle algorithm. Iterate over 1/8 of the circle,
        // reflect to all sides
        while (ox >= oy) {
            // Center
            if (ox !== oy) {
                // Bottom
                _hline(x - ox, y + oy, x + ox, color, clipX1, clipY1, clipX2, clipY2);
                
                // Top
                if (oy > 0) { _hline(x - ox, y - oy, x + ox, color, clipX1, clipY1, clipX2, clipY2); }
            }
                
            let old = oy;
            // -4 gives better shape for small circles
            if (err <= -4) {
                ++oy;
                err += dy;
                dy += 2;
            }

            // ...intentionally no "else" to allow diagonal changes in both x and y position...
            
            if (err > -4) {
                // Caps
                _hline(x - old, y + ox, x + old, color, clipX1, clipY1, clipX2, clipY2);
                _hline(x - old, y - ox, x + old, color, clipX1, clipY1, clipX2, clipY2);
                --ox;
                dx += 2;
                err += dx - radius * 2;
            }
        } // while
    } // if color

    
    if ((outline & 0xff000000) && (outline !== color)) {
        // offset
        let ox = radius - 1, oy = 0;
        
        // step
        let dx = 1, dy = 1;
        let err = dx - radius * 2;

        while (ox >= oy) {
            if (ox !== oy) {
                // Bottom center
                _pset(x - ox, y + oy, outline, clipX1, clipY1, clipX2, clipY2);
                _pset(x + ox, y + oy, outline, clipX1, clipY1, clipX2, clipY2);

                if (oy > 0) {
                    // Top center
                    _pset(x - ox, y - oy, outline, clipX1, clipY1, clipX2, clipY2);
                    _pset(x + ox, y - oy, outline, clipX1, clipY1, clipX2, clipY2);
                }
            }

            // Bottom cap
            _pset(x - oy, y + ox, outline, clipX1, clipY1, clipX2, clipY2);

            // Top cap
            _pset(x - oy, y - ox, outline, clipX1, clipY1, clipX2, clipY2);
            
            if (oy > 0) {
                // Bottom cap
                _pset(x + oy, y + ox, outline, clipX1, clipY1, clipX2, clipY2);
                
                // Top cap
                _pset(x + oy, y - ox, outline, clipX1, clipY1, clipX2, clipY2);
            }
            

            if (err <= -4) {
                ++oy;
                err += dy;
                dy += 2;
            }

            if (err > -4) {
                --ox;
                dx += 2;
                err -= radius * 2 - dx;
            }
        } // while
    } // if outline
}


function _executeREC(cmd) {
    const outline = cmd.outline, fill = cmd.fill,
          clipX1 = cmd.clipX1, clipY1 = cmd.clipY1,
          clipX2 = cmd.clipX2, clipY2 = cmd.clipY2;
    
    let x1 = cmd.x1, x2 = cmd.x2, y1 = cmd.y1, y2 = cmd.y2;

    if ((outline !== fill) && (outline > 0xFFFFFF)) {
        _hline(x1, y1, x2, outline, clipX1, clipY1, clipX2, clipY2);
        _hline(x1, y2, x2, outline, clipX1, clipY1, clipX2, clipY2);
        _vline(x1, y1 + 1, y2 - 1, outline, clipX1, clipY1, clipX2, clipY2);
        _vline(x2, y1 + 1, y2 - 1, outline, clipX1, clipY1, clipX2, clipY2);
        x1 += 1; y1 += 1; x2 -= 1; y2 -= 1;
    }

    if (fill & 0xff000000) {
        
        // Snap to integer and set_clip to screen. We don't need to
        // round because we know that the rect is visible.
        x1 = Math.max((x1 + 0.5) | 0, clipX1);
        x2 = Math.min((x2 + 0.5) | 0, clipX2);
        y1 = Math.max((y1 + 0.5) | 0, clipY1);
        y2 = Math.min((y2 + 0.5) | 0, clipY2);

        // Blend spans
        for (let y = y1, i = y1 * _SCREEN_WIDTH; y <= y2; ++y, i += _SCREEN_WIDTH) {
            _hline(x1, y, x2, fill, clipX1, clipY1, clipX2, clipY2);
        }
    }
}


function _executeLIN(cmd) {
    _line(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.color, cmd.clipX1, cmd.clipY1, cmd.clipX2, cmd.clipY2, cmd.open1, cmd.open2);
}


function _line(x1, y1, x2, y2, color, clipX1, clipY1, clipX2, clipY2, open1, open2) {
    if (y1 === y2) {
        // Horizontal perf optimization/avoid divide by zero
        const dx = _Math.sign(x2 - x1)
        if (open1) { x1 += dx; }
        if (open2) { x2 -= dx; }
        _hline(Math.min(x1, x2), y1, Math.max(x1, x2), color, clipX1, clipY1, clipX2, clipY2);
    } else if (x1 === x2) {
        // Vertical perf optimization
        const dy = _Math.sign(y2 - y1)
        if (open1) { y1 += dy; }
        if (open2) { y2 -= dy; }
        _vline(x1, Math.min(y1, y2), Math.max(y1, y2), color, clipX1, clipY1, clipX2, clipY2);
    } else {
        // General case via DDA

        // Slope:
        const dx = x2 - x1, dy = y2 - y1;
        const moreHorizontal = abs(dx) > abs(dy);

        if ((moreHorizontal && (x2 < x1)) ||
            (! moreHorizontal && (y2 < y1))) {
            // Swap endpoints to go in increasing direction on the dominant axis.
            // Slope is unchanged because both deltas become negated.
            let temp;
            temp = y1; y1 = y2; y2 = temp;
            temp = x1; x1 = x2; x2 = temp;
            temp = open1; open1 = open2; open2 = temp;
        }

        if (moreHorizontal) {
            // Crop horizontally:
            const m = dy / dx;

            if (open1) { ++x1; y1 += m; }            
            if (open2) { --x2; /* y2 is unused */ } 

            // Adjust for x1 being clipped
            const step = Math.max(clipX1, x1) - x1;
            x1 += step; y1 += m * step;

            // Adjust for x2 being clipped (y2 is unused, so ignore it)
            x2 = Math.min(x2, clipX2);
            
            for (let x = x1, y = y1; x <= x2; ++x, y += m) {
                _pset(x, y, color, clipX1, clipY1, clipX2, clipY2);
            } // for x
        } else { // Vertical
            // Compute the inverted slope
            const m = dx / dy;

            if (open1) { ++y1; x1 += m; } 
            if (open2) { --y2; x2 -= m; } 
            
            // Crop vertically:
            const step = Math.max(clipY1, y1) - y1;
            x1 += step * m; y1 += step;
            y2 = Math.min(y2, clipY2);
            for (let y = y1, x = x1; y <= y2; ++y, x += m) {
                _pset(x, y, color, clipX1, clipY1, clipX2, clipY2);
            } // for y
            
        } // if more horizontal
    } // if diagonal
}


function _executePIX(cmd) {
    // Series of points that have already been clipped
    // and converted to integers.
    
    const data = cmd.data;
    const N = data.length;
    for (let p = 0; p < N; p += 2) {
        const offset = data[p];
        const color = data[p + 1];

        // Must be unsigned shift to avoid sign extension
        const a255 = color >>> 24;

        if (a255 === 0xff) {
            // No blending
            _screen[offset] = color;
        } else if (a255 > 0) {
            // Blend

            // No need to force to unsigned int because the alpha channel of the output is always 0xff
            
            const a = a255 * (1 / 255);
            let back = _screen[offset];
            let result = 0xFF000000;
            result |= ((back & 0x00FF0000) * (1 - a) + (color & 0x00FF0000) * a + 0.5) & 0x00FF0000;
            result |= ((back & 0x0000FF00) * (1 - a) + (color & 0x0000FF00) * a + 0.5) & 0x0000FF00;
            result |= ((back & 0x000000FF) * (1 - a) + (color & 0x000000FF) * a + 0.5) & 0x000000FF;
            _screen[offset] = result;
        }
    }
}


function _executeSPR(metaCmd) {
    // Note that these are always integers, which we consider
    // pixel centers.
    const clipX1 = metaCmd.clipX1, clipY1 = metaCmd.clipY1,
          clipX2 = metaCmd.clipX2, clipY2 = metaCmd.clipY2;

    // For each sprite in the array
    const data = metaCmd.data;
    for (let i = 0; i < data.length; ++i) {
        const cmd = data[i];
        
        let opacity = cmd.opacity;
        const spr = cmd.sprite;
        const override_color = cmd.override_color;
        
        // Compute the net transformation matrix

        // Source bounds, inclusive
        const srcX1 = cmd.cornerX, srcX2 = cmd.cornerX + cmd.sizeX - 1,
              srcY1 = cmd.cornerY, srcY2 = cmd.cornerY + cmd.sizeY - 1;
        
        // The net forward transformation is: (note that SX, SY = source center, not scale!)
        // c = cos, s = sin, f = scale
        //
        // [srcx]   [1 0 SX][1/fx 0   0][ c -s 0][1 0 -DX][dstx]
        // [srcy] = [0 1 SY][0   1/fy 0][ s  c 0][0 1 -DY][dsty]
        // [ 1  ]   [0 0  1][0    0   1][ 0  0 1][0 0   1][ 1  ]
        //
        // [srcx]   [1 0 SX][c/fx -s/fx 0][1 0 -DX][dstx]
        // [srcy] = [0 1 SY][s/fy  c/fy 0][0 1 -DY][dsty]
        // [ 1  ]   [0 0  1][  0    0   1][0 0   1][ 1  ]
        //
        // A = c/fx, B = -s/fx, C = s/fy, D = c/fy
        //
        // [srcx]   [1 0 SX][A B 0][1 0 -DX][dstx]
        // [srcy] = [0 1 SY][C D 0][0 1 -DY][dsty]
        // [ 1  ]   [0 0  1][0 0 1][0 0   1][ 1  ]
        //
        // [srcx]    [A B (SX - A*DX - B*DY)][dstx]
        // [srcy] =  [C D (SY - C*DX - D*DY)][dsty]
        //                                   [ 1  ]
        //
        // The inverse transformation for computing destination bounds is:
        //  
        // [dstx]   [1 0 DX][ c s 0][fx  0 0][1 0 -SX][srcx]
        // [dsty] = [0 1 DY][-s c 0][ 0 fy 0][0 1 -SY][srcy]
        // [ 1  ]   [0 0  1][ 0 0 1][ 0  0 1][0 0   1][ 1  ]
        //
        // E = c*fx, F = -s*fx, G = s*fy, H = c*fy
        //
        // [dstx]   [E F DX][srcx - SX]
        // [dsty] = [G H DY][srcy - SY]
        //                  [   1     ]
        
        // Source and destination centers
        const DX = cmd.x, DY = cmd.y,
              SX = srcX1 + cmd.sizeX * 0.5, SY = srcY1 + cmd.sizeY * 0.5;

        const cos = Math.cos(cmd.angle), sin = Math.sin(cmd.angle);
        const fx = cmd.scaleX, fy = cmd.scaleY;

        const A = cos/fx, B = -sin/fx, C = sin/fy, D = cos/fy;
        const E = cos*fx, F =  sin*fx, G = -sin*fy, H = cos*fy;
        const I = DX - SX*E - SY*G, J = DY - SX*F - SY*H;

        ////////////////////////////////////////////////////////////////////////////////
        // Compute the (inclusive) destination bounds by projecting all
        // four corners from texture space to screen space
        
        let dstX1 = Infinity, dstX2 = -Infinity,
            dstY1 = Infinity, dstY2 = -Infinity;

        for (let i = 0; i <= 1; ++i) {
            for (let j = 0; j <= 1; ++j) {
                // Coordinates of the bounding box extremes
                const srcX = srcX1 + i * cmd.sizeX,
                      srcY = srcY1 + j * cmd.sizeY;

                // Transform from texture space to pixel space
                let tmp = E * (srcX - SX) + G * (srcY - SY) + DX;
                dstX1 = Math.min(tmp, dstX1); dstX2 = Math.max(tmp, dstX2);
                
                tmp     = F * (srcX - SX) + H * (srcY - SY) + DY;
                dstY1 = Math.min(tmp, dstY1); dstY2 = Math.max(tmp, dstY2);
            }
        }

        // Round the bounding box using the draw_rect rules for inclusive integer
        // bounds with open top and left edges at pixel center samples.
        dstX1 = Math.round(dstX1); dstY1 = Math.round(dstY1);
        dstX2 = Math.floor(dstX2 - 0.5); dstY2 = Math.floor(dstY2 - 0.5);

        // Restrict to the clipping region
        dstX1 = Math.max(dstX1, clipX1); dstY1 = Math.max(dstY1, clipY1);
        dstX2 = Math.min(dstX2, clipX2); dstY2 = Math.min(dstY2, clipY2);

        // Iterate over *output* pixel centers in this region. Because the
        // transformed texel centers won't usually land exactly on pixel
        // centers, we have to be conservative with the bounds here.
        //
        // Don't snap the bounds to integers...we want to hit points that
        // correspond to texel centers in the case where there is no
        // rotation or scale (we'll end up rounding the actual destination
        // pixels later and stepping in integer increments anyway).

        console.assert(cmd.spritesheetIndex !== undefined &&
                       cmd.spritesheetIndex >= 0 &&
                       cmd.spritesheetIndex < _spritesheetArray.length);
        // May be reassigned below when using flipped X values
        let srcData = _spritesheetArray[cmd.spritesheetIndex]._uint32Data;
        const srcDataWidth = srcData.width;

        if ((Math.abs(Math.abs(A) - 1) < 1e-10) && (Math.abs(B) < 1e-10) &&
            (Math.abs(C) < 1e-10) && (Math.abs(Math.abs(D) - 1) < 1e-10) &&
            (! override_color)) {
            // Simple case; x and y-axis uniform scale, no rotation, and no alpha
            // test. Use a memcpy.  The x and y-axes may be inverted, and there
            // can be xy translation applied. This branch is primarily
            // here to accelerate map rendering.
            
            const width = (dstX2 - dstX1 + 1) | 0;
            if (width >= 1) {
                const srcY = ((dstY1 + 0.4999 - DY) * D + SY) | 0;
                let srcOffset = (((dstX1 + 0.4999 - DX) + SX) | 0) + srcY * srcDataWidth;
                let dstOffset = (dstX1 + dstY1 * _SCREEN_WIDTH) | 0;
                const srcStep = (srcDataWidth * D) | 0;

                if (A < 0) {
                    // Use the flipped version
                    srcOffset += srcDataWidth - 2 * SX;
                    srcData = _spritesheetArray[cmd.spritesheetIndex]._uint32DataFlippedX;
                }

                if ((! cmd.hasAlpha) && (Math.abs(opacity - 1) < 1e-10)) {
                    // Memcpy case
                    for (let dstY = dstY1; dstY <= dstY2; ++dstY, dstOffset += _SCREEN_WIDTH, srcOffset += srcStep) {
                        // This TypedArray.set call saves about 3.5 ms/frame
                        // compared to an explicit horizontal loop for map
                        // rendering on Firefox. Chrome and Safari are fast
                        // even for the general case, so this isn't as
                        // necessary on those browsers...but it doesn't hurt.
                        
                        // console.assert(dstOffset + width <= _screen.length, `dstX1=${dstX1}, dstX2 = ${dstX2}, _screen.length = ${_screen.length}, width = ${width}, dstOffset = ${dstOffset}, dstOffset % _SCREEN_WIDTH = ${dstOffset % _SCREEN_WIDTH}, dstY = ${dstY}, dstY2 = ${dstY2}`);
                        // console.assert(srcOffset + width <= srcData.length);
                        _screen.set(srcData.slice(srcOffset, srcOffset + width), dstOffset);
                    } // dstY
                } else {
                    // Blending case
                    for (let dstY = dstY1; dstY <= dstY2; ++dstY, dstOffset += _SCREEN_WIDTH, srcOffset += srcStep) {
                        for (let i = 0; i < width; ++i) {
                            let color = srcData[srcOffset + i];
                            let a255 = color >>> 24;
                            
                            // Test alpha *first* in this case, because quite often we'll be in a sprite
                            // with a lot of alpha == 0 pixels and not need to go further.
                            if (a255 > 0x0f) {
                                // Blending
                                if (opacity < 1) {
                                    // Make more transparent
                                    
                                    // 4 high bits
                                    const alpha4 = ((a255 >>> 4) * opacity + 0.5) >>> 0;
                                    a255 = ((alpha4 << 4) | alpha4) >>> 0;
                                }

                                if (a255 >= 0xf0) {
                                    // 100% alpha, no blend needed
                                    _screen[dstOffset + i] = (color | 0xFF000000) >>> 0;
                                } else if (a255 > 0x0f) {
                                    // Fractional alpha
                                
                                    // No need to force to unsigned int because the alpha channel of
                                    // the output is always 0xff
                                    const a = a255 * (1 / 255);
                                    const back = _screen[dstOffset + i];
                                    
                                    let result = 0xFF000000;
                                    result |= ((back & 0x00FF0000) * (1 - a) + (color & 0x00FF0000) * a + 0.5) & 0x00FF0000;
                                    result |= ((back & 0x0000FF00) * (1 - a) + (color & 0x0000FF00) * a + 0.5) & 0x0000FF00;
                                    result |= ((back & 0x000000FF) * (1 - a) + (color & 0x000000FF) * a + 0.5) & 0x000000FF;
                                
                                    _screen[dstOffset + i] = result;
                                }
                            } // alpha > 0
                        } // column
                    } // row
                } // needs alpha
            } // width >= 1
        } else {
            // General case. It doesn't help performance to break out the
            // case of no rotation with alpha test and optimize that
            // separately, so process everything together.

            // Extract the common terms of blending into the override color
            const override = override_color ? _colorToUint32(override_color) : 0;
            const override_a = 1 - (override >>> 24) * (1 / 255);

            const override_mode = (override_a === 1) ? 0 : (override_a === 0) ? 2 : 1;
            const override_r = (override & 0x00FF0000) * (1 - override_a) + 0.5;
            const override_g = (override & 0x0000FF00) * (1 - override_a) + 0.5;
            const override_b = (override & 0x000000FF) * (1 - override_a) + 0.5;
            
            for (let dstY = dstY1; dstY <= dstY2; ++dstY) {
                // Offset everything by 0.5 to transform the pixel
                // center. Needs to be *slightly* less in order to round
                // the correct way.
                const xterms = (dstY + 0.4999 - DY) * B + SX;
                const yterms = (dstY + 0.4999 - DY) * D + SY;
                
                let dstOffset = dstX1 + dstY * _SCREEN_WIDTH;
                
                for (let dstX = dstX1; dstX <= dstX2; ++dstX, ++dstOffset) {
                    const srcX = ((dstX + 0.4999 - DX) * A + xterms) | 0;
                    const srcY = ((dstX + 0.4999 - DX) * C + yterms) | 0;

                    // Show bounds
                    //_screen[dstOffset] = 0xffffffff;// continue;
                    
                    if ((srcX >= srcX1) && (srcX <= srcX2) && (srcY >= srcY1) && (srcY <= srcY2)) {
                        // Inside the source sprite

                        // May be overriden below.
                        let color = srcData[srcX + srcY * srcDataWidth];
                        
                        if (opacity < 1) {
                            // Make more transparent
                            
                            // 4 high bits
                            const alpha4 = ((color >>> 28) * opacity + 0.5) | 0;
                            color = ((alpha4 << 28) | (alpha4 << 24) | (color & 0xFFFFFF)) >>> 0;
                        }
                        
                        // the following is an inlining of: _pset(dstX, dstY, color, clipX1, clipY1, clipX2, clipY2);
                        
                        // Must be unsigned shift to avoid sign extension
                        const a255 = color >>> 24;
                        if (a255 < 0x10) {
                            // 0% alpha
                        } else {

                            if (override_mode === 0) {
                                // Common case, do nothing
                            } else if (override_mode === 1) {
                                // Blend
                                const src = color;
                                color &= 0xFF000000;
                                color |= (override_r + (src & 0x00FF0000) * override_a) & 0x00FF0000;
                                color |= (override_g + (src & 0x0000FF00) * override_a) & 0x0000FF00;
                                color |= (override_b + (src & 0x000000FF) * override_a) & 0x000000FF;
                            } else {
                                // Completely overwrite
                                color = (color & 0xFF000000) | (override & 0xFFFFFF);
                            }

                            if (a255 >= 0xf0) {
                                // 100% alpha
                                _screen[dstOffset] = color;
                            } else if (a255 > 0x0f) {
                                // Fractional alpha
                                
                                // No need to force to unsigned int because the alpha channel of the output is always 0xff
                                const a = a255 * (1 / 255);
                                const back = _screen[dstOffset];
                                let result = 0xFF000000;
                                
                                result |= ((back & 0x00FF0000) * (1 - a) + (color & 0x00FF0000) * a + 0.5) & 0x00FF0000;
                                result |= ((back & 0x0000FF00) * (1 - a) + (color & 0x0000FF00) * a + 0.5) & 0x0000FF00;
                                result |= ((back & 0x000000FF) * (1 - a) + (color & 0x000000FF) * a + 0.5) & 0x000000FF;
                                
                                _screen[dstOffset] = result;
                            }
                        }
                        
                    } // clamp to source bounds
                } // i
            } // j
        } // if simple case
    } // for each sprite
}


function _executeTXT(cmd) {
    const height = cmd.height, width = cmd.width, color = cmd.color,
          str = cmd.str
    let   outline = cmd.outline, shadow = cmd.shadow;
    const clipX1 = cmd.clipX1, clipY1 = cmd.clipY1,
          clipX2 = cmd.clipX2, clipY2 = cmd.clipY2;
    const font = _fontArray[cmd.fontIndex];
    const data = font._data.data;
    const fontWidth = font._data.width;

    let x = cmd.x, y = cmd.y;

    if ((font._spacing.x === 0) && (outline & 0xFF000000) && (color & 0xFF000000)) {
        // Script font with outline and color. Draw in two passes so that
        // the connectors are not broken by outlines.
        
        // Disable color and re-issue the command to draw shadow and outline
        // before drawing the main text.
        cmd.color = 0;
        _executeTXT(cmd);

        // Pass through, disabling outline and shadow that were
        // already processed.
        outline = shadow = 0;
    }
    
    for (let c = 0; c < str.length; ++c) {
        // Remap the character to those in the font sheet
        const chr = _fontMap[str[c]] || ' ';
        const bounds = font._bounds[chr];

        x += bounds.pre;
        if (chr !== ' ') {
            const tileY = Math.floor(bounds.y1 / font._charHeight) * font._charHeight;
            const charWidth  = bounds.x2 - bounds.x1 + 1;
            const charHeight = bounds.y2 - bounds.y1 + 1;

            // Shift the destination down by the offset of this character relative to the tile
            for (let j = 0, dstY = y + bounds.y1 - tileY + bounds.yOffset; j < charHeight; ++j, ++dstY) {
                // On screen in Y?
                if (((dstY >>> 0) <= clipY2) && (dstY >= clipY1)) {
                    for (let i = 0, dstX = x, dstIndex = x + (dstY * _SCREEN_WIDTH), srcIndex = bounds.x1 + (bounds.y1 + j) * fontWidth;
                         i < charWidth;
                         ++i, ++dstX, ++dstIndex, ++srcIndex) {
                        
                        const bits = data[srcIndex];

                        // Most pixels in fonts are empty, so explicitly test if ANY bit
                        // is set before looking deeper
                        if (bits) {
                            let v = 0;
                            if (bits & 0x1) {                 // 0001 color = color
                                v = color;
                            } else if (outline & 0xff000000) {
                                // Outline is on
                                if (bits & 0x8) {             // 1000 outline w/ shadow = shadow
                                    // Shadow if using outline
                                    v = shadow;
                                } else if (bits & 0x2) {      // 0010 outline. May also match 0100 and be ignored
                                    v = outline;
                                }
                            } else if (bits & 0x4) {          // 0100 shadow w/o outline
                                // Shadow
                                v = shadow;
                            }

                            // Could inline _pset code for performance and insert dstIndex. There
                            // is not any apparent performance difference on Chrome, however
                            if (v) { _pset(dstX, dstY, v, clipX1, clipY1, clipX2, clipY2); }
                        }
                    } // for i
                } // on screen y
            } // for j
            
        } // character in font

        x += (bounds.x2 - bounds.x1 + 1) + _postGlyphSpace(str, c, font) - font._borderSize * 2 + bounds.post;
        
    } // for each character
}


// Convex polygon rendering
function _executePLY(cmd) {
    const clipX1 = cmd.clipX1, clipY1 = cmd.clipY1,
          clipX2 = cmd.clipX2, clipY2 = cmd.clipY2;
    const points = cmd.points;
    const numPoints = points.length >> 1;
    const color = cmd.color, outline = cmd.outline;
    
    // Fill
    if (color & 0xff000000) {
        const shift = ((outline & 0xff000000) && (outline !== color)) ? 0.5 : 0;
        // For each non-horizontal edge, store:
        //
        //    [startX, startY, dx/dy slope, vertical height].
        //
        // These are the values needed for the edge-intersection test.  Add edges so that the
        // start Y coordinate is less than the end one.
        const edgeArray = [];

        // vertical bounds on the triangle
        let y0 = clipY2 + 1, y1 = clipY1 - 1;
        
        function addEdge(Sx, Sy, Ex, Ey) {
            if (Sy < Ey) {
                // Update bounding box
                if (Sy < y0) { y0 = Sy; }
                if (Ey > y1) { y1 = Ey; }
                edgeArray.push([Sx, Sy, (Ex - Sx) / (Ey - Sy), Ey - Sy]);
            } else if (Sy > Ey) {
                addEdge(Ex, Ey, Sx, Sy);
            }
        }

        // Add all edges
        for (let p = 0; p < points.length - 3; p += 2) {
            addEdge(points[p], points[p + 1], points[p + 2], points[p + 3]);
        }
        {
            // Wraparound to close the polygon
            const p = points.length - 2;
            addEdge(points[p], points[p + 1], points[0], points[1]);
        }

        // Intentionally left as a float to avoid int->float
        // conversion within the inner loop
        y0 = Math.max(clipY1, Math.floor(y0));
        y1 = Math.min(clipY2, Math.floor(y1));
        for (let y = y0; y <= y1; ++y) {
            
            // For this scanline, intersect the edge lines of the triangle.
            // As a convex polygon, we can simply intersect ALL edges and then
            // take the min and max intersections.
            let x0 = Infinity, x1 = -Infinity;
            for (let i = edgeArray.length - 1; i >= 0; --i) {
                const edge = edgeArray[i];
                const edgeX = edge[0], edgeY = edge[1], slope = edge[2], edgeHeight = edge[3];

                // Find the intersection
                const dy = y - edgeY;
                if ((dy >= 0) && (dy <= edgeHeight)) {
                    const x = edgeX + dy * slope;
                    x0 = Math.min(x0, x);
                    x1 = Math.max(x, x1);
                }
            }

            // If there was a nonzero line length, draw it
            if (x0 + shift <= x1 - shift) {
                _hline(x0 + shift, y, x1 - shift, color, clipX1, clipY1, clipX2, clipY2);
            }
        }
    }

    if ((outline & 0xff000000) && (outline !== color)) {
        for (let p = 0; p < points.length - 3; p += 2) {
            _line(points[p], points[p + 1], points[p + 2], points[p + 3], outline, clipX1, clipY1, clipX2, clipY2, false, true);
        }
        {
            // Wraparound to close the polygon
            const p = points.length - 3;
            _line(points[p], points[p + 1], points[p + 2], points[p + 3], outline, clipX1, clipY1, clipX2, clipY2, false, true);
        }
    }
}


var _executeTable = Object.freeze({
    REC : _executeREC,
    CIR : _executeCIR,
    SPR : _executeSPR,
    PIX : _executePIX,
    TXT : _executeTXT,
    LIN : _executeLIN,
    PLY : _executePLY
});
